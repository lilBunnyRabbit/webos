import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "style-guide",
  name: "Style Guide",
  description: "Every design token and UI kit component, live in the current theme (docs/design).",
  pitch: {
    problem: "Building a new screen means guessing which colours and components exist.",
    solution: "See every design token and UI component live, in the current theme.",
  },
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  keywords: ["design", "components", "tokens", "ui kit", "colours", "typography"],
  defaults: {
    constraints: {
      width: { min: 720 },
      height: { min: 520 },
    },
  },
  component: () => import("./style-guide.app.svelte"),
});
