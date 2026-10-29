import { Boat as BoatIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "ferry",
  name: "Ferry Loader",
  icon: BoatIcon,
  building: Building.FERRY,
  achievements: [
    { id: "ferry-first", title: "All aboard", text: "Load a whole sailing." },
    { id: "ferry-even-keel", title: "Even keel", text: "Load a sailing of four or more within 2% of level." },
    { id: "ferry-bus", title: "Coach party", text: "Stow a bus on the deck." },
    { id: "ferry-full-deck", title: "Full deck", text: "Earn three stars on a sailing of six vehicles." },
    { id: "ferry-levels", title: "Loading master", text: "Finish every ferry level.", goal: 12 },
    { id: "ferry-daily", title: "Daily sailing", text: "Load the daily sailing." },
    { id: "ferry-no-undo", title: "First time right", text: "Load a sailing of five or more with three stars and no undo.", secret: true },
  ],
  load: () => import("./game.svelte"),
});
