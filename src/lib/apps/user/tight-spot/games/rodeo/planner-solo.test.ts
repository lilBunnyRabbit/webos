import { Vehicle } from "../../core/vehicle";
import { prove_courses } from "./prove";

// Front, all-wheel, crab and skid steer, short and long.
prove_courses([
  [Vehicle.HATCH, 1],
  [Vehicle.HATCH, 2],
  [Vehicle.BUS, 1],
  [Vehicle.LADDER, 1],
  [Vehicle.TELEHANDLER, 1],
  [Vehicle.BOBCAT, 1],
]);
