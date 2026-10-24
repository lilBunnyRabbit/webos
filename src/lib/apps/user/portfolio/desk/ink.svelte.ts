import kernel, { type SettingsService } from "$lib/core/api";
import { measure_colors } from "./measure";
import { ink_for } from "./ink";

export function on_primary(): { readonly value: string } {
  const settings = $derived(kernel.service<SettingsService>("settings"));
  let value = $state("text-background");
  $effect(() => {
    void JSON.stringify(settings.theme);
    const frame = requestAnimationFrame(() => {
      const colors = measure_colors({ primary: "var(--primary)", background: "var(--background)", foreground: "var(--foreground)" });
      if (colors.primary && colors.background && colors.foreground) value = ink_for(colors.primary.rgb, colors.background.rgb, colors.foreground.rgb);
    });
    return () => cancelAnimationFrame(frame);
  });
  return {
    get value() {
      return value;
    },
  };
}
