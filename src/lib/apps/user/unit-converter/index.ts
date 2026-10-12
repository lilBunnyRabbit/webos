import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Ruler as RulerIcon } from "phosphor-svelte";

export default define_app({
  id: "unit-converter",
  name: "Unit Converter",
  icon: RulerIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Convert length, mass, temperature, data size and more.",
  keywords: ["convert", "units", "metric", "imperial", "celsius", "fahrenheit", "bytes"],
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./unit-converter.app.svelte"),
});
