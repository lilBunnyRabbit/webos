import React from "react";

const presets: [background: string, foreground: string, primary: string, secondary: string, accent: string][] = [
  // Dark blue-gray
  [
    "oklch(0.26 0.0233 230.47)",
    "oklch(0.76 0.0183 99.68)",
    "oklch(0.76 0.0865 123.43)",
    "oklch(0.76 0.0865 303.43)",
    "oklch(0.76 0.0865 50.47)",
  ],
  // Light version of first preset
  [
    "oklch(0.97 0.015 230.47)",
    "oklch(0.25 0.025 99.68)",
    "oklch(0.65 0.12 123.43)",
    "oklch(0.65 0.12 303.43)",
    "oklch(0.65 0.12 50.47)",
  ],
  // Light pastel blue
  ["oklch(0.98 0.01 250)", "oklch(0.22 0.02 80)", "oklch(0.7 0.09 200)", "oklch(0.7 0.09 20)", "oklch(0.7 0.09 320)"],
  // Red & Black (looks good)
  [
    "oklch(0.45 0.22 29)", // background: rich, deep red
    "oklch(0.15 0.01 0)", // foreground: near black
    "oklch(0.85 0.02 29)", // primary: light red for highlights
    "oklch(0.7 0.13 80)", // secondary: gold/yellow accent
    "oklch(0.7 0.13 340)", // accent: magenta accent
  ],
  // Dark warm
  ["oklch(0.15 0.03 40)", "oklch(0.85 0.02 120)", "oklch(0.65 0.1 60)", "oklch(0.65 0.1 240)", "oklch(0.65 0.1 180)"],
  // Dark purple-tinted
  ["oklch(0.35 0.04 300)", "oklch(0.9 0.015 60)", "oklch(0.8 0.08 270)", "oklch(0.8 0.08 90)", "oklch(0.8 0.08 180)"],
  // Mid-tone green
  ["oklch(0.5 0.06 120)", "oklch(0.95 0.01 300)", "oklch(0.7 0.12 30)", "oklch(0.7 0.12 210)", "oklch(0.7 0.12 330)"],
  // Dark cool
  ["oklch(0.22 0.025 270)", "oklch(0.8 0.02 180)", "oklch(0.6 0.09 350)", "oklch(0.6 0.09 170)", "oklch(0.6 0.09 90)"],
  // Warm sunset
  ["oklch(0.18 0.04 30)", "oklch(0.92 0.01 50)", "oklch(0.7 0.15 40)", "oklch(0.65 0.13 320)", "oklch(0.75 0.14 60)"],
  // Ocean breeze
  ["oklch(0.95 0.02 220)", "oklch(0.2 0.03 240)", "oklch(0.6 0.14 210)", "oklch(0.65 0.1 190)", "oklch(0.7 0.12 160)"],
  // Forest night
  ["oklch(0.2 0.04 160)", "oklch(0.88 0.015 140)", "oklch(0.65 0.13 145)", "oklch(0.7 0.1 110)", "oklch(0.75 0.11 80)"],
  // Lavender dream
  [
    "oklch(0.96 0.025 310)",
    "oklch(0.28 0.04 290)",
    "oklch(0.68 0.14 285)",
    "oklch(0.72 0.11 310)",
    "oklch(0.65 0.13 340)",
  ],
  // Monochrome dark
  ["oklch(0.18 0.01 0)", "oklch(0.85 0.01 0)", "oklch(0.5 0.02 0)", "oklch(0.4 0.015 0)", "oklch(0.65 0.02 0)"],
  // Vibrant coral
  ["oklch(0.25 0.03 350)", "oklch(0.93 0.01 30)", "oklch(0.7 0.18 15)", "oklch(0.65 0.16 340)", "oklch(0.75 0.17 50)"],
  // Ultra contrast: Pure black & white with neon accents
  ["oklch(0.0 0 0)", "oklch(1.0 0 0)", "oklch(0.75 0.3 145)", "oklch(0.75 0.3 330)", "oklch(0.75 0.3 60)"],
  // Ultra contrast: Pure white with black text and electric colors
  ["oklch(1.0 0 0)", "oklch(0.0 0 0)", "oklch(0.55 0.35 265)", "oklch(0.6 0.32 340)", "oklch(0.65 0.33 100)"],
  // Ultra contrast: Deep black with bright neon
  ["oklch(0.05 0 0)", "oklch(0.98 0.01 0)", "oklch(0.8 0.28 195)", "oklch(0.8 0.28 310)", "oklch(0.8 0.28 45)"],
  // Ultra contrast: Cyberpunk
  ["oklch(0.1 0.05 290)", "oklch(0.95 0.03 180)", "oklch(0.7 0.35 325)", "oklch(0.75 0.32 200)", "oklch(0.8 0.3 55)"],
  // Ultra contrast: Terminal green
  ["oklch(0.0 0 0)", "oklch(0.85 0.22 145)", "oklch(0.75 0.25 145)", "oklch(0.65 0.2 145)", "oklch(0.8 0.28 85)"],
  // Ultra contrast: High visibility
  ["oklch(0.98 0.005 80)", "oklch(0.15 0.01 280)", "oklch(0.45 0.35 260)", "oklch(0.5 0.3 30)", "oklch(0.4 0.32 340)"],
  // Pure black & white
  ["oklch(0.0 0 0)", "oklch(1.0 0 0)", "oklch(0.6 0 0)", "oklch(0.4 0 0)", "oklch(0.8 0 0)"],
];

// Used as a type reference for theme objects
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DEFAULT_LIGHT = {
  background: "#ffffff",
  foreground: "#222222",
  primary: "#2563eb",
  secondary: "#64748b",
  accent: "#d97706",
};


export default function SettingsApp() {
  React.useEffect(() => {
    console.log("~~~~~~~~~~~~~~~ SettingsApp mounted");
  }, []);

  // Helper to get current CSS variable values
  function getCurrentColors() {
    return {
      background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      foreground: getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim(),
      primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      secondary: getComputedStyle(document.documentElement).getPropertyValue("--secondary").trim(),
      accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    };
  }

  const [colors, setColors] = React.useState(getCurrentColors);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setColors((prev) => {
      const updated = { ...prev, [name]: value };
      document.documentElement.style.setProperty(`--${name}`, value);
      return updated;
    });
  }

  function applyTheme(theme: typeof DEFAULT_LIGHT) {
    setColors(theme);
    Object.entries(theme).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--${key}`, value);
    });
  }

  function presetToTheme(preset: (typeof presets)[0]): typeof DEFAULT_LIGHT {
    return {
      background: preset[0],
      foreground: preset[1],
      primary: preset[2],
      secondary: preset[3],
      accent: preset[4],
    };
  }

  function handlePresetClick(preset: (typeof presets)[0]) {
    const theme = presetToTheme(preset);
    applyTheme(theme);
  }

  return (
    <div className="p-4 space-y-4">
      <form className="space-y-3">
        {Object.entries(colors).map(([key, value]) => (
          <div key={key} className="flex items-center gap-3">
            <label htmlFor={key} className="w-28 capitalize">
              {key}
            </label>
            <input
              id={key}
              name={key}
              type="text"
              value={value}
              onChange={handleChange}
              className="border border-foreground/30 rounded px-2 py-1 flex-1"
              style={{
                background: key === "background" ? value : undefined,
                color: key === "foreground" ? value : undefined,
              }}
            />
            <input
              type="color"
              defaultValue={value.startsWith("#") ? value : ""}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange={(e) => handleChange({ target: { name: key, value: e.target.value } } as any)}
              className="w-8 h-8 border border-foreground/30 rounded"
              // disabled={!/^#([0-9A-Fa-f]{3}){1,2}$/.test(value)}
              title="Pick color"
            />
          </div>
        ))}
      </form>

      <div className="mt-6">
        <h3 className="text-md font-semibold mb-2">Presets</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {presets.map((preset, i) => (
            <button
              key={i}
              type="button"
              className="flex gap-1 p-4 rounded-lg border-2 border-foreground/20 hover:border-primary/60 hover:shadow-lg transition-all duration-200 cursor-pointer justify-center items-center"
              onClick={() => handlePresetClick(preset)}
              title={`Preset ${i + 1} - Click to apply`}
            >
              {preset.map((color, j) => (
                <span
                  key={j}
                  className="flex-1 min-w-8 min-h-8 aspect-square rounded-lg shadow-md border-2 border-background"
                  style={{
                    background: color || "#fff",
                    display: "inline-block",
                  }}
                />
              ))}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
