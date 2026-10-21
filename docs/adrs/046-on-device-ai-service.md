# ADR-046: On-Device AI Service
**Date:** 2026-10-17
**Status:** Implemented

> **Revision 2026-10-21: structured answers from pictures** ([ADR-061](./061-ai-games.md)). `extract()` accepts the same content as `prompt()`: with a picture it needs `prompt-image` and creates its fresh session with `expectedInputs`, still destroyed after the call and never kept. The availability flow apps show (checking, unavailable, download notice) moved into the app kit as `AiGate`; Ask uses it.
>
> **Revision 2026-10-20: structured answers and usage** ([ADR-054](./054-ai-assistant-over-shell.md)). `extract(messages, zod schema)` returns a validated value through `responseConstraint`, on a fresh session it destroys. `measure(text)` returns `{ used, window }` from a kept token-counter session (a `window` alongside the count, so a cost can show as a share before any chat exists). `prompt()` returns the chat's `{ used, window }` when it ends, and `sessions` carry it.

> **Revision 2026-10-19:** `prompt()` takes pictures: `AiMessage.content` can be `AiPart[]`, and `AiFeature.PROMPT_IMAGE` answers whether the model reads them ([ADR-051](./051-ai-image-input.md)).

## Context

Chrome ships built-in AI that runs Gemini Nano on the device after a one-time model download: Summarizer, Translator and Language Detector are stable on desktop (since 138), and the Prompt API is stable from 148. It's private and works offline, with no key and no backend. Android Chrome doesn't have it. Several wave 7 ideas want it: shell filters (`summarize`, `translate`, `lang`), an Ask window, later i18n Lab and Voice ([brainstorm](../brainstorm/2026-10-17_app-wave-7.md)). The owner chose one core service over per-app calls.

## Decision

- **Service `ai` (AiService).** One place that checks availability, creates and reuses the browser's model sessions, and reports model downloads.
  - `availability(feature)`: `"ready" | "download" | "no"` per feature (summarize, translate for a language pair, detect, prompt).
  - `summarize(text, { type, length })`, `translate(text, { to, from? })` (detects `from` when missing), `detect(text)` (ranked languages with confidence), `prompt(messages, { signal })` streaming text.
  - A model download runs as a task (ADR-013) with progress and Cancel.
- **Mobile.** A swapped variant (ADR-016) answers `"no"` for everything, so callers hide AI features instead of failing.
- **Shell.** The service contributes `summarize [--type tldr|key-points|teaser|headline] [--length short|medium|long]`, `translate --to <lang> [--from <lang>]` and `lang`, all reading piped text or files; `available()` hides them where the feature is `"no"`.
- **Ask.** A new app chats about an open file (Open with for text files) through `prompt()`.

## Alternatives Considered

- **A small util apps call:** no service, but no shared download progress, no swap for mobile, and every app re-checks availability.
- **Per-app calls:** each app owns its sessions; duplicated checks and no shell reach.

## Consequences

- One more service with an inspector (ADR-020): state per feature, download progress, live sessions.
- Language support depends on Chrome's model (Slovenian has to be checked on the owner's Chrome); `availability` answers that per pair.
- The browser's API names may still shift between Chrome versions; the service is the one place to adapt.
