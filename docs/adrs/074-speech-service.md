# ADR-074: Speech Service
**Date:** 2026-10-26
**Status:** Implemented

## Context
Ask should read its answers aloud as they stream (idea from LaxDOTexe, [brainstorm](../brainstorm/2026-10-26_ask-tts.md)). The browser's `speechSynthesis` is a single queue per page: `speak()` appends, `cancel()` empties the whole queue, voices arrive asynchronously (`getVoices()`, `voiceschanged`) and differ per OS. Two windows driving it directly cancel each other.

## Decision
A new kernel service, `speech` (`SpeechService`), owns the queue. Same implementation on desktop and mobile, and in solo.

```ts
const speech = $derived(kernel.service<SpeechService>("speech"));
speech.voices;                                  // SpeechSynthesisVoice[], reactive
speech.speaking;                                // owner id | null, reactive
speech.speak(owner, text, { markdown?: true }); // whole text
speech.feed(owner, chunk, { markdown?: true }); // streaming: queues each finished sentence
speech.end(owner);                              // speak the unfinished tail
speech.stop(owner?);                            // that owner, only while it's speaking; no owner = everything
```

- **Owner** is a string: a window id for apps, `"shell"` for `say`.
- **One speaker at a time, newest wins:** speech from a new owner cancels the current one first. `stop(owner)` is a no-op unless that owner is speaking.
- **Sentences:** `feed` buffers and queues text up to each sentence end (`.`, `!`, `?`, `…` followed by a space or newline, or a blank line); `end` flushes the rest.
- **Markdown** (`markdown: true`): symbols stripped (emphasis, headings, links to their text, list markers, inline code to its text); a fenced code block is spoken as "Code block.". Hand-written, no dependency.
- **Voice and rate** come from SettingsService, `speech: { voice: string | null, rate: number }` in `/etc/settings.json` (voice = `voiceURI`; `null` = the browser's default for the page language). Settings › Speech lists `speech.voices`, a rate slider (0.5–2) and a Test button.
- **Windows:** the service stops an owner's speech when its window closes.
- **Shell:** `say <text>` (also piped text; `.md` input spoken with `markdown: true`) and `speech stop`.
- **Inspector:** voices count, current owner, queued sentences.

Depends on `settings`, `windows`.

## Alternatives Considered
- **A kit helper** (`$kit/utils/speech`): the page-wide queue still needs one owner, which becomes a module-level global without an inspector or shell commands.
- **Ask calls `speechSynthesis` directly:** two Ask windows cancel each other; the next app that speaks copies the code.
- **Queue behind instead of preempting:** answers pile up and a second window starts after the first's whole answer.
- **Voice and rate in Ask's own settings:** owner picked system-wide settings.

## Consequences
- One more kernel service and settings key; the settings schema gains `speech`.
- Any app can speak through one API, and the shell can too.
- Stopping is honest to the browser: no app can remove another's sentence from the queue, only the speaker can be stopped.

## Revision 2026-10-26: as built

- **Dependencies:** `settings`, `windows` and `files`; `say` reads piped files through FilesService.
- **API additions:** `queued` (sentences waiting, for the inspector) and `supported` (`false` without `speechSynthesis`, every call then a no-op; Ask and Settings hide their controls).
- **Sentences in markdown:** besides `.`, `!`, `?`, `…` and blank lines, a line break before a list item, heading, quote or table row, and the end of a heading line, end a sentence; otherwise a list reads as one run-on sentence. A numbered list marker (`1. `) is not a sentence end. An unclosed code fence waits whole, so its contents are never spoken.
- **Queue:** the service hands the browser one utterance at a time and keeps the rest itself, since Chrome cuts long queues short.
- **Default voice:** with `voice: null` the utterance gets the page language as `lang` and no voice, so the browser picks its default for that language. A saved voice the device doesn't list falls back the same way.
- **`say` and markdown:** piped file values are read, and spoken as markdown when every piece is a `.md` or `.markdown` file. `cat notes.md | say` yields text, so it is read with its symbols.
- **Loading:** `init.ts` `import()`s the class beside the boot chunk, like `ai`.
