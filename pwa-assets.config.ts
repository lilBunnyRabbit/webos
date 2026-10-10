import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

const BRAND_BACKGROUND = "#17252c";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BRAND_BACKGROUND } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: BRAND_BACKGROUND } },
  },
  images: ["public/logo.svg"],
});
