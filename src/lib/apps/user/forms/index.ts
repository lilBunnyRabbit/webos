import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { ListChecks as ListChecksIcon } from "phosphor-svelte";
import { z } from "zod";
import { FORMS_PROPS } from "./props";

const logic = () => import("./shell");

export default define_app({
  id: "forms",
  name: "Forms",
  icon: ListChecksIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Write a form as a Markdown checklist, send it as a link and collect the answers people send back.",
  keywords: ["form", "survey", "poll", "questionnaire", "checklist", "answers", "feedback", "link", "formlink"],
  associations: [".form.md", ".answers"],
  props: FORMS_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: {
    commands: [
      define_command({
        id: "form link",
        description: "A link that opens the form for filling in, with the whole form inside it",
        args: z.object({ path: arg.path(), copy: z.boolean().default(false).describe("Copy it too") }),
        positional: ["path"],
        short: { copy: "c" },
        complete: (field: string, partial: string, context: { session: ShellSession }) =>
          field === "path" ? logic().then((m) => m.complete_forms(partial, context)) : undefined,
        run: async (context) => (await logic()).link(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./forms.app.svelte"),
});
