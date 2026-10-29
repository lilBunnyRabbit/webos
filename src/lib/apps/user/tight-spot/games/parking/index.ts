import { LetterCircleP as ParkingIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "parking",
  name: "Tight Spot",
  icon: ParkingIcon,
  building: Building.CAR_PARK,
  achievements: [
    { id: "first-park", title: "Parked", text: "Park the car in a bay." },
    { id: "kerbside", title: "Kerbside", text: "Parallel park between two cars." },
    { id: "every-spot", title: "Every kind of spot", text: "Park in each of the eighteen kinds of spot.", goal: 18 },
    { id: "licensed", title: "Licensed", text: "Park the first 48 levels.", goal: 48 },
    { id: "hardest-lap", title: "Hardest lap", text: "Park all 18 levels of the hardest lap.", goal: 18 },
    { id: "open-lot", title: "Any free bay", text: "Find a spot in the open lot." },
    { id: "daily", title: "Daily spot", text: "Park the daily spot." },
    { id: "perfect-park", title: "Perfect park", text: "Park with 95% precision or better: centred and square in the bay." },
    { id: "one-sweep", title: "One sweep", text: "Parallel park with a single reverse.", secret: true },
  ],
  load: () => import("./game.svelte"),
});
