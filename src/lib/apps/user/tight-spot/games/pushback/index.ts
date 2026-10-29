import { AirplaneTaxiing as AirplaneIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "pushback",
  name: "Pushback",
  icon: AirplaneIcon,
  building: Building.APRON,
  achievements: [
    { id: "pushback-first", title: "Off blocks", text: "Push an aircraft back onto the taxiway." },
    { id: "pushback-one-go", title: "One smooth push", text: "Finish a pushback without changing direction." },
    { id: "pushback-by-the-book", title: "Cleared on time", text: "Earn three stars on a pushback." },
    { id: "pushback-levels", title: "Ramp lead", text: "Finish every pushback level.", goal: 12 },
    { id: "pushback-daily", title: "Daily departure", text: "Finish the daily pushback." },
  ],
  load: () => import("./game.svelte"),
});
