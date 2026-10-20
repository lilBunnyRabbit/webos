import kernel, { type AiService, type ShellService } from "$lib/core/api";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { to_text } from "$lib/core/api/services/shell/values";
import { live_file } from "$lib/core/contexts/app";
import { EMPTY_ENABLED, ENABLED_PATH, EnabledSchema, eligible, gather, question_message, type Ran } from "./assistant";
import { system_prompt } from "./ask";

const enabled = live_file(ENABLED_PATH, EMPTY_ENABLED, EnabledSchema);

export async function ask({ args, input, piped, signal }: CommandContext<{ question: string[] }>): Promise<string> {
  const question = args.question.join(" ").trim();
  if (!question) throw new ShellError("ask: what's the question? Like: ask what's on my shopping list");
  const ai = kernel.service<AiService>("ai");
  const shell = kernel.service<ShellService>("shell");

  let ran: Ran | null;
  if (piped) {
    const lines: string[] = [];
    for await (const value of input) lines.push(to_text(value, (type) => shell.value_type(type)));
    ran = { line: "piped input", text: lines.join("\n"), failed: false };
  } else {
    const on = new Set((await enabled.read()).on);
    ran = await gather(ai, shell, eligible(shell.commands).filter((command) => on.has(command.id)), question, null, signal);
  }

  let answer = "";
  const messages = [
    { role: "system" as const, content: system_prompt(null) },
    { role: "user" as const, content: question_message(question, ran) },
  ];
  for await (const chunk of ai.prompt(messages, { signal })) answer += chunk;
  return answer.trim();
}
