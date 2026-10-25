import { z } from "zod";
import kernel, { WindowFlag, type AppsService, type WindowsService } from "$lib/core/api";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";
import { SECTION_IDS, type SectionId } from "./ids";

const APP_ID = "portfolio";

// An open Portfolio only comes forward: telling it to show another section would need a props-update API WebOS lacks.
function open(section?: SectionId): void {
  const windows = kernel.service<WindowsService>("windows");
  const existing = windows.sorted_list((a, b) => b[1].order - a[1].order).find(([, { app }]) => app.id === APP_ID)?.[0];
  if (!existing) {
    kernel.service<AppsService>("apps").launch(APP_ID, section ? { section } : undefined);
    return;
  }
  if (windows.get(existing)?.flags.has(WindowFlag.MINIMIZED)) windows.toggle_minimize(existing);
  windows.focus(existing);
}

export default {
  values: {
    profile: {
      columns: ["name", "role", "email", "github", "linkedin"],
      text: (profile) => `${profile.name}\n${profile.role}\n${profile.email}`,
      open: () => open(),
    },
  },
  commands: [
    define_command({
      id: "whoami",
      description: "Who made WebOS: name, role and contact. Click to open the Portfolio",
      yields: "profile",
      async run() {
        const { PROFILE } = await import("./content/profile");
        return {
          $type: "profile",
          name: PROFILE.name,
          role: PROFILE.role,
          email: PROFILE.email,
          github: PROFILE.github,
          linkedin: PROFILE.linkedin,
        };
      },
    }),
    define_command({
      id: "portfolio",
      description: "Open the Portfolio at a section, or bring it forward",
      args: z.object({ section: z.enum(SECTION_IDS).optional().describe("Window to open at; the tour when left out") }),
      positional: ["section"],
      run: ({ args }) => open(args.section),
    }),
  ],
} satisfies ShellContribution;
