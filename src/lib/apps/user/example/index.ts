import { define_app, WindowFlag } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Hand as HandIcon } from "phosphor-svelte";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";

const logic = () => import("./task");

export default define_app({
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  defaults: {
    constraints: {
      width: {
        min: 250,
        max: 500,
      },
    },
    flags: [WindowFlag.DEBUG],
  },
  description: "A starter app showing the app context, saved state, props and a background task.",
  props: z.object({ count: z.number() }),
  shell: {
    commands: [
      define_command({
        id: "example task",
        description: "Run the example background task, about 20 s; --fail makes its first run fail",
        args: z.object({ fail: z.boolean().default(false).describe("Fail once while packing, to try Retry") }),
        short: { fail: "f" },
        run: async ({ args }) => {
          const job = (await logic()).run_example_task(args.fail);
          return `Started ${job.title}: see Activity Monitor › Tasks`;
        },
      }),
    ],
  },
  component: () => import("./example.app.svelte"),
});
