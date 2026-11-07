import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { AirplaneTakeoff as TakeoffIcon, AirplaneLanding as LandingIcon, Wind as WindIcon } from "phosphor-svelte";

export default [
  { icon: WindIcon, title: "A real wing", text: "Lift and drag over the angle of attack: pull too far and the wing stalls, the nose drops and you trade height for speed." },
  { icon: TakeoffIcon, title: "Four planes, four feels", text: "A forgiving trainer, a bush plane that stops in 40 m, a 70 t airliner slow to spool and to pitch, and a glider you winch up and keep up in thermals." },
  { icon: LandingIcon, title: "Flare and float", text: "Close to the runway the wing floats in ground effect. Hold it off and touch down under 0.6 m/s for a kiss." },
] satisfies AppHighlight[];
