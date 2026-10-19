# ADR-051: AI Image Input
**Date:** 2026-10-19
**Status:** Implemented

## Context

AiService (ADR-046) takes text only: `AiMessage.content` is a string. Shopping List wants to read a handwritten or printed list from a photo, and Chrome's Prompt API accepts pictures in a message when the session was created for them (`expectedInputs: [{ type: "image" }]`). The browser has no other OCR (`TextDetector` is behind a flag), and phones have no built-in AI at all ([brainstorm](../brainstorm/2026-10-19_shopping-list.md)).

## Decision

- **Parts, as in the Prompt API.** `AiMessage.content: string | AiPart[]`, with `AiPart = { type: "text"; value: string } | { type: "image"; value: Blob }`. The shape is Chrome's own, so parts pass to the browser unchanged. `built-in-ai.d.ts` declares the content parts and the `image` input type.
- **A session for pictures only when needed.** `prompt()` creates the session with `expectedInputs: [text, image]` only when a message in the conversation holds a picture. Session reuse keys image chats apart (`prompt image {history}`), so a text session is never asked about a picture; a text chat that gains one moves to a new session. Pictures are keyed by identity (a `WeakMap` id per `Blob`), so the same picture continues a chat and a different one with equal bytes doesn't.
- **`AiFeature.PROMPT_IMAGE` (`"prompt-image"`).** Its own availability, from `LanguageModel.availability({ expectedInputs })`, so an app can offer image reading only where it works. It's checked at boot with the others and shows in the inspector.
- **Mobile.** `MobileAiService` answers `no` for it too.
- **Existing callers don't change.** A string is still a valid `content`; Ask and the shell commands are untouched.
- **Shell:** nothing.

## Alternatives Considered

- **A separate `describe_image(blob, prompt)` method.** Simpler to call, but a second session type to manage and no follow-up questions about the same picture.
- **Images always on.** Every chat session created with `expectedInputs` image: no extra key, but a chat would then fail on a device whose model takes text and not pictures.
- **OCR in the app only (tesseract.js).** Shopping List does this as the fallback anyway; the model reads handwriting and layout far better where it exists.

## Consequences

- `AiFeature` has five values; `Record<AiFeature, …>` literals (the services, the inspector's count) list it.
- An image chat holds its pictures in the browser's session until it's evicted (four chats kept) or the page reloads.
- Picture support follows Chrome's model and flags; the service is the one place that adapts.
