import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { AirplaneTakeoff as TakeoffIcon, AirplaneLanding as LandingIcon, Wind as WindIcon } from "phosphor-svelte";

export default [
  { icon: WindIcon, title: "A real wing", text: "Lift and drag over the angle of attack: pull too far and the wing stalls, the nose drops and you trade height for speed." },
  { icon: TakeoffIcon, title: "It flies when it's ready", text: "The tail comes up, the wheels go light, and the trainer lifts off by itself once there's air enough under the wing." },
  { icon: LandingIcon, title: "Flare and float", text: "Close to the runway the wing floats in ground effect. Hold it off and touch down under 0.6 m/s for a kiss." },
] satisfies AppHighlight[];
