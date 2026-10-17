# AiService

Key `ai` · Depends on: `files`, `tasks`, `notifications` · ADR: [046](../../adrs/046-on-device-ai-service.md) · Source: `src/lib/core/api/services/ai/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

One place for Chrome's built-in AI, which runs Gemini Nano on the device after a one-time model download: summaries (Summarizer), translation (Translator), language detection (LanguageDetector) and chat (the Prompt API's `LanguageModel`). It checks what the browser has, creates the browser's model sessions and keeps them for reuse, and runs model downloads as tasks. Private and offline once downloaded; no key, no backend.

Two classes, picked by `platform_services` in `kernel/init.ts` and lazy-loaded with the windows and desktop services, so neither weighs on the boot chunk:

- `AiService` (desktop).
- `MobileAiService` (phones and tablets, ADR-016): Android Chrome has no built-in AI, so every feature answers `no` and every call rejects with `AI_REQUIREMENTS`. Callers hide the feature instead of failing.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `features` | `Record<AiFeature, AiAvailability>` | `$state`. The last answer per feature: `summarize`, `translate`, `detect`, `prompt` → `ready`, `download` or `no`. `translate` is the API alone (`download` while it exists, `ready` once a pair is ready) |
| `downloads` | `TaskJob[]` | Running model downloads: TasksService jobs owned by `"ai"` |
| `sessions` | `AiSessionInfo[]` | Model sessions kept for reuse: `{ feature, label }` |
| `availability` | `(feature, pair?: { from, to }) => Promise<AiAvailability>` | Asks the browser again and updates `features`. Translate needs `pair` for an exact answer; a checked pair only ever raises `features.translate` to `ready` |
| `summarize` | `(text, { type?, length?, signal? }) => Promise<string>` | `type`: `tldr`, `key-points` (default), `teaser`, `headline`; `length`: `short` (default), `medium`, `long`. Plain-text output |
| `translate` | `(text, { to, from?, signal? }) => Promise<string>` | Without `from`, detects it first and fails on `und`. Text already in `to` (same base language, `en-US` = `en`) comes back unchanged |
| `detect` | `(text, { signal? }) => Promise<DetectedLanguage[]>` | `{ language, confidence }`, most likely first, as the browser ranks them. `und` when it can't tell |
| `prompt` | `(messages: AiMessage[], { signal? }) => AsyncGenerator<string>` | Streams the answer to the last message (must be `user`) in pieces. A leading `system` message sets the instructions |

`AI_REQUIREMENTS` (in `type.ts`) is the one sentence on what's needed: desktop Chrome 138+ for summaries, translation and detection, 148+ for chat, about 22 GB free for the download, no phones or other browsers. Ask and the error messages show it.

The browser's globals are typed in `built-in-ai.d.ts`, since TypeScript's DOM lib doesn't have them; only the members used are declared.

## State

- `features`: `$state`, all `no` until `init`'s checks answer.
- Kept sessions: `$state.raw` list of `{ key, feature, label, model: Promise }`. Keys: `summarize {type} {length}`, `translate {from} {to}`, `detect`, and `prompt {history}` for chats.

## Lifecycle

- `init()`: asks the browser for all four features **without awaiting**, so boot never waits on it. Until it answers, everything reads `no` and the shell commands stay hidden for that moment.
- `destroy()`: destroys every kept session.
- `MobileAiService` has neither.

## Persistence

None. The models live in the browser's own storage, shared with every site that uses them; sessions are memory only.

## Behaviour & invariants

### Availability

`check()` in `availability.ts` maps the browser's answer: `available` → `ready`, `downloadable` and `downloading` → `download`, `unavailable` → `no`. A missing global is `no`. A rejected check (an invalid language tag) is `no`. Translator pairs report `downloadable` until a site first uses them, so without a pair translate answers `download` whenever the API exists.

### Sessions and downloads

1. A call looks for a kept session under its key and reuses it. A session being created is kept as its promise, so two calls at once share one; a failed creation is dropped from the list.
2. Otherwise it asks `availability`. `no` throws "{label} isn't available here." plus `AI_REQUIREMENTS`. `ready` creates the session directly.
3. `download` runs the creation as a TasksService job (`download.ts`, loaded on first use): title "Downloading the {label}", the browser's `downloadprogress` (`loaded`, 0-1) as the job's progress and "N% downloaded" as its message, Cancel aborting `create()` through `context.signal`. A finished job toasts "{label} downloaded". A cancelled or failed one rejects the call with "Download cancelled" or the job's error. The feature turns `ready` after it.
4. The browser wants user activation for a `create()` that downloads. Calls from a click or a typed command have it.

### Chat sessions

`prompt()` keeps the API stateless while still reusing the browser's session: a chat session is kept under the key of the messages it already holds.

- A call whose history (all but the last message) matches a kept key takes that session out of the list while it answers, so two windows never share one. Otherwise it creates one with the history as `initialPrompts`.
- It streams `promptStreaming(last)` and yields each piece.
- Finished: the session goes back under the key of history + question + answer, labelled "Chat, N questions". At most four chats are kept; the oldest is destroyed.
- Stopped (`signal`), failed or abandoned by the caller half-way: the session is destroyed, since it holds a partial turn.

So Ask's next question reuses the session; "New chat" or a changed file starts a new one.

## Shell

Contributes (`ai/shell.ts`), each with `available()` hiding it while its feature answers `no` ("needs Chrome's built-in AI on a desktop"):

- `summarize [inputs…] [--type tldr|key-points|teaser|headline] [--length short|medium|long]`
- `translate [inputs…] --to <lang> [--from <lang>]`
- `lang [inputs…]`, yielding `language` values (`language`, `name`, `confidence`, `of`)

Inputs: files given as paths, or the words as one text when none of them is a file (like `hash`); piped, each file value is read as a file and everything else joins into one text. Folders and empty texts are errors. One result per input; with several, `summarize` and `translate` start each with the file's name. Language args use the `language` completer (a fixed list of common codes with English names; `availability` decides per pair). See [shell](shell.md#contributions).

## Known gaps

- No chunking: text over the model's input quota fails with the browser's error.
- `summarize` and `translate` don't stream in the shell; the result prints when done.
- The kept sessions have no idle timeout; they live until evicted or reload.
- Slovenian support depends on the owner's Chrome and hasn't been confirmed on it.
