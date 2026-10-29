import { FlagCheckered as FlagIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "f1",
  name: "Hot Lap",
  icon: FlagIcon,
  building: Building.TRACK,
  achievements: [
    { id: "f1-first", title: "Clean lap", text: "Finish a lap of Hot Lap without touching a wall." },
    { id: "f1-on-pace", title: "On the pace", text: "Set a three-star lap." },
    { id: "f1-ghost", title: "Ghost buster", text: "Beat your own ghost on a track." },
    { id: "f1-clean-session", title: "Clean sheet", text: "Drive all three laps of a session clean." },
    { id: "f1-tracks", title: "Grand tour", text: "Set a clean lap on every track.", goal: 3 },
    { id: "f1-daily", title: "Daily hot lap", text: "Set a clean lap on the track of the day." },
  ],
  load: () => import("./game.svelte"),
});
