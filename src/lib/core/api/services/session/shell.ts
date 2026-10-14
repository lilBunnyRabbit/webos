import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import type { SessionService } from "./type";

export function session_shell(session: SessionService): ShellContribution {
  return {
    commands: [
      define_command({
        id: "win reopen",
        description: "Reopen the last closed window",
        available: () => session.closed.length > 0,
        run: () => void session.reopen_closed(),
      }),
    ],
  };
}
