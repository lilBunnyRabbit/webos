import { Key as KeyIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "valet",
  name: "Valet Rush",
  icon: KeyIcon,
  building: Building.VALET_STAND,
  achievements: [
    { id: "valet-first", title: "Keys, please", text: "Hand a car back to its owner." },
    { id: "valet-precise", title: "White glove", text: "Park a customer's car at 95% precision or better." },
    { id: "valet-bus", title: "Bus driver", text: "Hand the bus back without a dent." },
    { id: "valet-clean", title: "Not a scratch", text: "Hand back eight cars in one shift without a dent.", goal: 8 },
    { id: "valet-hundred", title: "Big tipper", text: "Score 100 in one shift." },
    { id: "valet-daily", title: "Daily shift", text: "Work the daily shift." },
    { id: "valet-ten-minutes", title: "Long shift", text: "Keep the stand going for ten minutes.", secret: true },
  ],
  load: () => import("./game.svelte"),
});
