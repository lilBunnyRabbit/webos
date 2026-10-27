import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "jigsaw",
  name: "Jigsaw",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  tools: ["image/*"],
  props: z.object({ path: z.string().optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 380 },
    },
  },
  achievements: [
    { id: "first-solve", title: "Picture perfect", text: "Finish a puzzle." },
    { id: "pieces-100", title: "Hundred pieces", text: "Finish a puzzle of 100 pieces or more." },
    { id: "pieces-200", title: "Big picture", text: "Finish a 200-piece puzzle." },
    { id: "solves-10", title: "Puzzler", text: "Finish 10 puzzles.", goal: 10 },
    { id: "no-peeking", title: "No peeking", text: "Finish a puzzle of 100 pieces or more without the preview in the frame.", secret: true },
  ],
  component: () => import("./jigsaw.app.svelte"),
});
