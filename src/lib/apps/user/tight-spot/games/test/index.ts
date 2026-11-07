import { IdentificationCard as LicenceIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";
import { LEVEL_COUNT } from "./stars";

export default define_game({
  id: "test",
  name: "Driving Test",
  icon: LicenceIcon,
  building: Building.TEST_CENTRE,
  achievements: [
    { id: "test-pass", title: "Licensed", text: "Pass a driving test." },
    { id: "test-clean", title: "Clean sheet", text: "Pass a driving test without a single fault." },
    { id: "test-routes", title: "Knows the town", text: "Pass the Market, Station and School routes.", goal: 3 },
    { id: "test-bay", title: "Textbook bay", text: "Park the test's bay with Perfect precision." },
    { id: "test-levels", title: "Examiner's pick", text: "Pass every level of the driving test.", goal: LEVEL_COUNT },
    { id: "test-daily", title: "Daily drive", text: "Finish the daily driving test." },
  ],
  load: () => import("./game.svelte"),
  progress: () => import("./progress").then((module) => module.default),
});
