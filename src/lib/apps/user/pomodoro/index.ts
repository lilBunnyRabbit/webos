import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Timer as TimerIcon } from "phosphor-svelte";

export default define_app({
  id: "pomodoro",
  name: "Pomodoro",
  icon: TimerIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Focus in timed sessions with short and long breaks, and see how your week went.",
  keywords: ["timer", "focus", "tomato", "break", "productivity"],
  defaults: {
    constraints: {
      width: { min: 300 },
      height: { min: 380 },
    },
  },
  widget: () => import("./widget.svelte"),
  component: () => import("./pomodoro.app.svelte"),
});
