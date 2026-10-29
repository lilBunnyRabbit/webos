import { IdentificationCard as LicenceIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "test",
  name: "Driving Test",
  icon: LicenceIcon,
  building: Building.TEST_CENTRE,
  achievements: [
    { id: "test-pass", title: "Licensed", text: "Pass a driving test." },
    { id: "test-clean", title: "Clean sheet", text: "Pass a driving test without a single fault." },
    { id: "test-routes", title: "Knows the town", text: "Pass every route of the driving test.", goal: 3 },
    { id: "test-bay", title: "Textbook bay", text: "Park the test's bay with Perfect precision." },
  ],
  load: () => import("./game.svelte"),
});
