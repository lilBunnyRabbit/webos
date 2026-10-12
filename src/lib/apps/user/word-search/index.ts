import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { MagnifyingGlass as MagnifyingGlassIcon } from "phosphor-svelte";

export default define_app({
  id: "word-search",
  name: "Word Search",
  icon: MagnifyingGlassIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Find the hidden words in a grid of letters.",
  keywords: ["wordsearch", "word find", "words", "puzzle", "letters"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 460 },
    },
  },
  component: () => import("./word-search.app.svelte"),
});
