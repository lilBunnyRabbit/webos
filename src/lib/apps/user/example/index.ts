import { define_app, WindowFlag } from "$lib/core/api";
import { Hand as HandIcon } from "phosphor-svelte";

export default define_app({
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["user"],
  defaults: {
    constraints: {
      width: {
        min: 250,
        max: 500,
      },
    },
    flags: [WindowFlag.DEBUG],
  },
  component: () => import("./example.app.svelte"),
});
