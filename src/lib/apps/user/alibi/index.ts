import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { ai_icon } from "$kit/components/ai-icon";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "alibi",
  name: "Alibi",
  icon: ai_icon(AppIcon),
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  props: z.object({ seed: z.number().int().nonnegative().optional() }),
  highlights: () => import("./highlights"),
  achievements: [
    { id: "first-case", title: "Case closed", text: "Catch a suspect in their lie." },
    { id: "clean", title: "Sharp eye", text: "Close a case without a wrong accusation." },
    { id: "few-questions", title: "Three questions", text: "Close a case after 3 questions or fewer." },
    { id: "cases-10", title: "Detective", text: "Close 10 cases.", goal: 10 },
    { id: "silent", title: "Didn't need to ask", text: "Close a case without asking a single question.", secret: true },
  ],
  component: () => import("./alibi.app.svelte"),
});
