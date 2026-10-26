import { z } from "zod";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import { to_text } from "../shell/values";
import { is_file_value } from "../files/shell";
import type { FilesService } from "../files/type";
import { SHELL_SPEAKER, type SpeechService } from "./type";

const is_markdown = (name: string) => /\.(md|markdown)$/i.test(name);

export function speech_shell(speech: SpeechService, files: () => FilesService): ShellContribution {
  const available = () => speech.supported || "this browser can't speak";

  return {
    commands: [
      define_command({
        id: "say",
        description: "Read text aloud; piped files are read, a .md file as markdown",
        args: z.object({ text: z.array(z.string()).default([]).describe("Words to say, or what's piped in") }),
        positional: ["text"],
        available,
        async run({ args, input, piped }) {
          const parts: { text: string; markdown: boolean }[] = [];
          if (args.text.length > 0) parts.push({ text: args.text.join(" "), markdown: false });
          else if (piped) {
            for await (const value of input) {
              if (!is_file_value(value)) parts.push({ text: to_text(value, () => undefined), markdown: false });
              else if (value.kind === "directory") throw new ShellError(`say: ${value.path} is a folder`);
              else {
                const file = await files().get_file(value.path);
                if (!file) throw new ShellError(`say: ${value.path}: no such file`);
                parts.push({ text: await file.text(), markdown: is_markdown(value.name) });
              }
            }
          }
          if (!parts.some((part) => part.text.trim())) throw new ShellError("say: give some text, or pipe some in");
          const markdown = parts.every((part) => part.markdown);
          speech.speak(SHELL_SPEAKER, parts.map((part) => part.text).join("\n\n"), { markdown });
        },
      }),
      define_command({
        id: "speech stop",
        description: "Stop whatever is being read aloud",
        available,
        run() {
          speech.stop();
        },
      }),
    ],
  };
}
