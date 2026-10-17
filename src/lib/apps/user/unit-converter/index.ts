import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "unit-converter",
  name: "Unit Converter",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Convert length, mass, temperature, data size and more.",
  keywords: [
    "convert",
    "units",
    "metric",
    "imperial",
    "celsius",
    "fahrenheit",
    "bytes",
    "measure",
    "length",
    "weight",
    "temperature",
  ],
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./unit-converter.app.svelte"),
});
