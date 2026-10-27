import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tic-tac-toe",
  name: "Tic-Tac-Toe",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  achievements: [
    { id: "first-win", title: "Three in a row", text: "Beat the computer." },
    { id: "medium", title: "Outsmarted", text: "Beat the computer on Medium." },
    { id: "local", title: "Pass and play", text: "Finish a two-player game." },
    { id: "wins-25", title: "Grid champion", text: "Beat the computer 25 times.", goal: 25 },
    { id: "stalemate", title: "Stalemate", text: "Hold Impossible to a draw.", secret: true },
  ],
  component: () => import("./tic-tac-toe.app.svelte"),
});
