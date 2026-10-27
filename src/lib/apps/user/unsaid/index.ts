import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { ai_icon } from "$kit/components/ai-icon";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "unsaid",
  name: "Unsaid",
  icon: ai_icon(AppIcon),
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 480 } } },
  props: z.object({ seed: z.number().int().nonnegative().optional() }),
  highlights: () => import("./highlights"),
  achievements: [
    { id: "first-round", title: "Said and done", text: "Finish a round." },
    { id: "no-pass", title: "No skipping", text: "Finish a round without passing a card." },
    { id: "first-clue", title: "Mind reader", text: "Get a card guessed from its first clue." },
    { id: "guessed-25", title: "Wordsmith", text: "Get 25 cards guessed in all.", goal: 25 },
    { id: "telepathy", title: "Telepathy", text: "Finish a round with every card guessed from its first clue.", secret: true },
  ],
  component: () => import("./unsaid.app.svelte"),
});
