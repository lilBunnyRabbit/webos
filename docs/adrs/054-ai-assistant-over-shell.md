# ADR-054: AI Assistant over Shell Commands
**Date:** 2026-10-20
**Status:** Accepted

## Context
Gemini Nano (ADR-046) runs on the device but has a context of a few thousand tokens and is weak at multi-step plans. The owner doesn't want AI features built into individual apps. Instead, one assistant should answer questions like "what's on my shopping list?" from app data. Apps already expose their data as shell commands that yield tagged values (ADR-033, ADR-034). Discussion: [brainstorm](../brainstorm/2026-10-20_ai-assistant.md).

## Decision
- **Ask is the assistant.** With no file open, Ask answers by picking one command, running it and phrasing the result. The logic lives in a module so a later corner panel can reuse it.
- **Read-only.** Version 1 runs no command that changes data.
- **Two-layer opt-in.** `Command.ai?: "read"` makes a command eligible. The user switches eligible commands on in Ask; all are off by default. Switches live in `app.ask.commands` (ADR-003).
- **One pick per question.** `ai.extract(messages, schema)` with `command: z.enum([...on, "none"])` and string args. The input includes the previous question and the command it ran. `"none"` means plain chat.
- **Answer.** A second call phrases the yielded values (serialized as text) in words. A "ran <command>" chip expands to the raw values.
- **Cost is visible.** `ai.measure(text)` gives each command's token cost. Sessions report `used` and `window`. Ask shows a chat memory bar in plain words, with a breakdown.
- **Shell.** `ask <question>` yields `text`; piped input becomes context. Hidden when the AI is unavailable.
- **AiService additions:** `extract<T>(messages, schema: z.ZodType<T>, options)` (sends `z.toJSONSchema` as `responseConstraint`, returns the validated value), `measure(text)`, and `used` / `window` on `AiSessionInfo`. `MobileAiService` rejects or answers zero.

## Alternatives Considered
- **AI inside each app** (recipe import, event parsing): rejected by the owner, because apps stay plain.
- **Every command visible:** ~140 descriptions (~4k tokens) overflow Nano.
- **Two-step pick (app, then command):** an extra call, and a wrong app means a wrong answer.
- **Keyword ranking without tags:** misses questions that share no words with the command.
- **Central allow-list:** drifts away from the apps.
- **Writes with confirm:** deferred until read picks prove reliable.
- **Corner panel or palette first:** the panel is deferred and the palette has no room for a chat.

## Consequences
- `Command` gains a field (revision on ADR-033/034); AiService gains three members (revision on ADR-046).
- Apps that want to be asked about add or tag read commands with model-friendly descriptions. Shopping List gets its first shell commands.
- Answers take two Nano calls (about 2–4 s) and can misread data; the "ran" chip keeps the source visible.
- Inside Ask there's no "current page" context; that comes with the panel.
- Desktop Chrome only; on mobile Ask shows its unavailable state.
