import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "pomodoro",
  name: "Pomodoro",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  defaults: {
    constraints: {
      width: { min: 300 },
      height: { min: 380 },
    },
  },
  shell: () => import("./commands"),
  on_fire: () => import("./on-fire"),
  widget: () => import("./widget.svelte"),
  achievements: [
    { id: "first-focus", title: "First tomato", text: "Finish a focus session." },
    { id: "full-set", title: "Earned it", text: "Finish the last focus of a set and reach a long break." },
    { id: "streak-7", title: "Every single day", text: "Finish a focus session seven days in a row.", goal: 7 },
    { id: "sessions-100", title: "Deep worker", text: "Finish 100 focus sessions.", goal: 100 },
  ],
  widget_size: { min: { w: 2, h: 2 }, max: { w: 4, h: 4 }, default: { w: 2, h: 2 } },
  component: () => import("./pomodoro.app.svelte"),
});
