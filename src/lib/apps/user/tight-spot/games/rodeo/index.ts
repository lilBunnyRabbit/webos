import { TrafficCone as TrafficConeIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "rodeo",
  name: "Rodeo",
  icon: TrafficConeIcon,
  building: Building.ARENA,
  achievements: [
    { id: "rodeo-first", title: "Into the ring", text: "Finish a rodeo course." },
    { id: "rodeo-clean", title: "Clean round", text: "Finish a course without knocking a cone." },
    { id: "rodeo-rig", title: "Rig rodeo", text: "Finish a course towing a trailer." },
    { id: "rodeo-shelves", title: "Whole garage", text: "Finish a course with a vehicle from every garage shelf.", goal: 7 },
    { id: "rodeo-daily", title: "Daily rodeo", text: "Finish the daily rodeo." },
  ],
  load: () => import("./game.svelte"),
});
