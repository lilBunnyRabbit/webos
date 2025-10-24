// TODO: persist

export interface ThemeSettings {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
}

function loadTheme(): ThemeSettings {
  const computed = getComputedStyle(document.documentElement);

  return {
    background: computed.getPropertyValue("--background").trim(),
    foreground: computed.getPropertyValue("--foreground").trim(),
    primary: computed.getPropertyValue("--primary").trim(),
    secondary: computed.getPropertyValue("--secondary").trim(),
    accent: computed.getPropertyValue("--accent").trim(),
  };
}

export const theme = $state<ThemeSettings>(loadTheme());

// TODO: revisit
// Auto-update CSS variables whenever theme changes
if (typeof window !== 'undefined') {
  $effect.root(() => {
    $effect(() => {
      console.log("theme updated", theme);
      // This tracks ALL properties of theme
      Object.entries(theme).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    });
  });
}