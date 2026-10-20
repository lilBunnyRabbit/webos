# AI assistant over shell commands

**Date:** 2026-10-20
**Participants:** owner, Claude

## Context

Feedback from L4X on Ask (no Markdown, scrolling after every reply) was fixed in 3.8.0. It led to the question of using Gemini Nano (AiService, ADR-046) across WebOS.

Owner direction: no AI features inside individual apps. Instead, one assistant answers questions such as "what's on my shopping list?" by reading app data through the shell commands apps already contribute (ADR-033, ADR-034).

What exists today:
- `Command` (`shell/type.ts:66`) has `id`, `description`, zod `args`, `yields`, `available()`. Nothing marks a command as reading or writing.
- About 140 command ids, service and app commands together. Data apps with commands: Calendar (`cal agenda`, `cal add`), Quick Notes (`quno ls`, `quno rm`), Kanban, Work Hours, Recipe Box, Time Since. Shopping List has none.
- Nano: a few thousand tokens of context; reliable at one constrained pick (`responseConstraint`), weak at multi-step plans. Desktop Chrome only; mobile answers "no".

Proposed flow: question → Nano picks `{command, args}` from a catalogue (schema-constrained) → the shell runs it → Nano answers from the yielded values.

## Topics discussed

### Writes: read-only first (decided)
Version 1 only answers questions. Writes ("add milk", "clock me out") come later, behind a confirm step, once read picks prove reliable.

### Where it lives: Ask, panel later (decided)
Ask with no file open becomes the assistant. The pick-run-answer logic goes in its own module, so a Linear-style corner panel can reuse it later. Known cost: inside Ask, the focused window is Ask itself, so there is no "what you're looking at" context until the panel exists.

### Which commands it sees (decided)
Owner: hard, because the context is so small. All ~140 descriptions come to about 4k tokens, too much for Nano.
Read-only shrinks the set to roughly 15–25 commands, about 600–800 tokens.
Decision: a new optional `ai?: "read"` field on `Command` opts a command in. One Nano call picks from all tagged commands. A test checks the catalogue against a token budget, so growth is caught early. This revises ADR-033/034 (the `Command` shape).
Rejected: two-step app-then-command pick (an extra call, and a wrong app means a wrong answer); keyword ranking without tags (misses "what am I doing tomorrow" → `cal agenda`).

### Structured output: `ai.extract` (decided)
New AiService method `extract<T>(messages, schema: z.ZodType<T>, { signal })`. It sends `z.toJSONSchema(schema)` as `responseConstraint` and returns the parsed, validated value. `MobileAiService` rejects it like `prompt`. Revises ADR-046.
Rejected: a `schema` option on `prompt`, which leaves parsing to every caller.

### Answer shape: prose plus a "ran" chip (decided)
Two calls: pick, then phrase. Nano answers in words from the values, serialized as text the way Terminal saves scrollback. Below the answer, a chip ("ran cal agenda tomorrow") expands to the raw values. Cost: about 2–4 s per question, and Nano can misread the data.

### No matching command (decided)
The schema allows `command: "none"`; Ask then answers as a plain chat, like today.

### Shell (decided)
An `ask <question>` command runs the same pick-run-answer and yields `text`. Piped input becomes context (`cat notes.md | ask "summarize"`). Hidden when the AI is unavailable.

### Opt-in by the user, with the context cost shown (decided)
Owner: commands are opt-in, and the user sees how much context each one takes.
- Two layers: `ai: "read"` makes a command eligible (read-only, described for the model). The user switches eligible commands on in Ask.
- Default: everything off. The empty state offers "Choose what Ask can read…"; until then Ask is a plain chat.
- Each row shows its token cost, measured with Chrome's `measureInputUsage`. A total bar shows the share of the session's window and what's left for the chat. The numbers appear once the model is ready.
- Saved in `app.ask.commands` (ADR-003 app storage), shared by every Ask window and the `ask` command.

### First wave (decided)
Shopping List (new `list ls`, `list items [list]`), Calendar (`cal agenda`), Quick Notes (`quno ls`), Kanban (`kanban ls`), Work Hours (`wh status`, `wh report`), Time Since (`since`).

### Follow-ups (decided)
The pick call also sees the previous question and the command it ran (not its values), so "and the day after?" resolves.

### Chat memory meter (decided)
Owner: show how full the context is, as much information as possible but not technical.
- AiService gets `measure(text): Promise<number>`. `AiSessionInfo` gains reactive `used` / `window`, updated after each answer, and the Kernel inspector shows them.
- Ask shows a thin bar below the toolbar, coloured by fill (primary; warning past 75 %; error past 90 %), with "Chat memory 38 % · about 12 more questions". Tapping it opens the breakdown: instructions, app commands, this conversation, free. Near full: "Older messages will be forgotten soon" and New chat.

## Key takeaways
- The assistant reads app data through shell commands. Apps get no AI code of their own.
- Everything is opt-in twice (app tags the command, user switches it on), and the context cost is visible.
- Nano's small context shapes every choice: read-only, one pick per question, a measured catalogue.

## Action items
- ADR-054 (AI assistant over shell commands); revision notes on ADR-033/034 (`Command.ai`) and ADR-046 (`extract`, `measure`, session usage).
- AiService: `extract`, `measure`, session usage; MobileAiService equivalents; inspector; `docs/system/services/ai.md`.
- `Command.ai` in `shell/type.ts`; `docs/system/services/shell.md`.
- Shopping List `shell.ts` with `list ls` and `list items`; `docs/apps/shopping-list.md`.
- Tag the first wave; tighten descriptions.
- Ask: assistant module (pick → run → answer), commands sheet with costs, memory meter, "ran" chip, `ask` shell command.
- Check: desktop window narrow and wide; mobile shows the unavailable state.

Open (decide during implementation, ask if structural): what happens on context overflow (Chrome evicts the oldest turns versus the service recreating the session); budget-test threshold.

## Action items

## Next session topics

- Multiple models (WebLLM / transformers.js), "choose who you talk to" (L4X's idea)
