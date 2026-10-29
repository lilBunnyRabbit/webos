import { Plant as PlantIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "mower",
  name: "Mow Day",
  icon: PlantIcon,
  building: Building.GARDEN,
  achievements: [
    { id: "mower-first", title: "First cut", text: "Mow a lawn." },
    { id: "mower-tidy", title: "Clean lines", text: "Mow a lawn with under 10% overlap." },
    { id: "mower-by-the-book", title: "Groundskeeper", text: "Earn three stars on a lawn." },
    { id: "mower-levels", title: "Head gardener", text: "Mow every garden in the levels.", goal: 12 },
    { id: "mower-daily", title: "Daily trim", text: "Mow the daily lawn." },
    { id: "mower-every-blade", title: "Every blade", text: "Mow all of a lawn without touching a flower.", secret: true },
  ],
  load: () => import("./game.svelte"),
});
