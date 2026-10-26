# SpeechService

Key `speech` · Depends on: `settings`, `windows`, `files` · ADR: [074](../../adrs/074-speech-service.md) · Source: `src/lib/core/api/services/speech/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Reads text aloud with the browser's `speechSynthesis`. The browser has one queue per page: `speak()` appends, `cancel()` empties all of it. Two windows driving it directly would cancel each other, so the service owns the queue and lets one owner speak at a time. Ask reads its answers through it, `say` reads from the shell, and Settings › Speech tests the voice.

One class on every platform and in solo. `kernel/init.ts` `import()`s it beside the boot chunk, the way it loads `ai`.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `voices` | `SpeechSynthesisVoice[]` | `$state.raw`. `getVoices()` at init and again on every `voiceschanged` (Chrome lists them late). Empty where speech isn't supported |
| `speaking` | `SpeechOwner \| null` | The owner speaking, or fed and waiting for its first finished sentence. `null` when quiet |
| `queued` | `number` | Sentences waiting behind the one being spoken (the inspector shows it) |
| `supported` | `boolean` | `"speechSynthesis" in globalThis`. Every call is a no-op without it |
| `speak` | `(owner, text, { markdown? }) => void` | The whole text, sentence by sentence. Silences whatever was playing first, the owner's own speech too |
| `feed` | `(owner, chunk, { markdown? }) => void` | Streaming: appends `chunk` to the owner's buffer and queues each sentence as it completes. A different owner, or an ended stream, preempts: cancel, then start fresh. `markdown` is read from the first chunk of a stream |
| `end` | `(owner) => void` | Ends the owner's stream: the unfinished tail is queued too. No-op unless that owner's stream is open |
| `stop` | `(owner?) => void` | With an owner: silences only while that owner is the speaker. Without one: silences everything |

`SpeechOwner` is a string: a window id for apps, `SHELL_SPEAKER` (`"shell"`) for `say`. `SpeakOptions` is `{ markdown?: boolean }`.

## State

- `stream`: `$state.raw<{ owner, markdown, buffer, ended, is_window } | null>`. `speaking` reads its owner.
- `pending`: `$state.raw<string[]>`, sentences already made speakable.
- `current`: the utterance playing, held so the browser doesn't drop its events.
- `generation`: bumped on every silence; a callback from an older generation is ignored.

## Lifecycle

- `init()`: without `speechSynthesis`, nothing. Otherwise it loads `voices`, listens for `voiceschanged`, and starts an effect that stops a window owner's speech when `windows.exists(owner)` turns false.
- `destroy()`: removes the listener, stops the effect, cancels speech.

## Persistence

None of its own. Voice and speed are SettingsService's `speech: { voice, rate }` in `/etc/settings.json` ([settings](settings.md#persistence)), read when each utterance is made, so a change applies from the next sentence.

## Behaviour & invariants

### One speaker, newest wins

Speech from a new owner cancels the current one first, never queues behind it. `stop(owner)` from an owner that isn't speaking does nothing: the browser can't take one utterance out of its queue, so "stop only mine" means "only if I'm the one speaking". An owner that existed as a window when its stream began (`windows.exists`) is stopped when the window closes. The shell's speech runs to the end, or until `speech stop`.

### The queue

The service hands the browser one utterance at a time and starts the next on its `end` (or `error`, which a cancel fires). Chrome cuts long queues and long utterances short, and only the service's own list can say what's left. Each utterance gets `rate` from settings, and `voice` when `settings.speech.voice` names a listed `voiceURI`; otherwise `lang` is the page's language (`<html lang>`, else `navigator.language`) and the browser picks its default voice for it. A saved voice that isn't on this device falls back the same way.

### Sentences (`text.ts`)

`split_sentences(text, markdown)` cuts finished sentences off the front of the buffer and returns the tail:

- A sentence ends at `.`, `!`, `?` or `…` followed by whitespace, or at a blank line. A sentence end at the very end of the buffer waits for the next chunk, so `3.14` isn't cut. A number at the start of a line (`1. `) isn't a sentence end.
- With `markdown`, a line break before a list item, heading, quote or table row ends a sentence, and so does the end of a heading line. A closed fenced code block is one sentence, `Code block.`; an unclosed one waits whole in the tail, so its contents are never read.

`speakable(sentence, markdown)` collapses whitespace and drops sentences with no letter or digit (`---`, a lone list marker). With `markdown` it first runs `strip_markdown`: headings, quotes, list markers and task boxes go; links and images read as their text; inline code as its text; bold, italic and strikethrough lose their marks (an underscore inside a word stays, so `snake_case` reads as written); table rows read as cells joined by commas, separator rows go; HTML tags become spaces. Hand-written, no dependency.

## Shell

Contributes (`speech/shell.ts`), both hidden where `supported` is false ("this browser can't speak"):

- `say [text…]`: the words as one text. Piped, each text value is read and each file value's file is read; when every piece is a `.md` or `.markdown` file, it's spoken with `markdown: true`. Nothing to say is an error. Returns at once; speech goes on in the background as owner `shell`.
- `speech stop`: silences everything.

No shortcut yet. See [shell](shell.md#contributions).

## Divergence from ADR

- `files` is a dependency too: `say` reads piped files through FilesService.
- `supported` and `queued` are public: the ADR's inspector shows queued sentences, and callers hide speech controls where the browser can't speak.
- In markdown mode a line break before a list item, heading, quote or table row, and the end of a heading line, also end a sentence (the ADR lists only punctuation and blank lines). Without it a list would run into one sentence.

## Known gaps

- `cat notes.md | say` reads the text with its symbols: `cat` yields text, not the file, so only `ls`-style file values are read as markdown.
- Abbreviations (`e.g. `) end a sentence early; the pause is the only effect.
- Voices are per OS and browser; a voice chosen on one machine is the browser default on another.
- No per-app voice, no shortcut for `speech stop`, no other apps speaking yet (brainstorm next topics).
