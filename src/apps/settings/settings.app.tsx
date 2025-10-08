import React from "react";

const DEFAULT_LIGHT = {
  background: "#ffffff",
  foreground: "#222222",
  primary: "#2563eb",
  secondary: "#64748b",
  accent: "#d97706",
};

const DEFAULT_DARK = {
  background: "#18181b",
  foreground: "#f4f4f5",
  primary: "#60a5fa",
  secondary: "#a1a1aa",
  accent: "#fbbf24",
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

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold mb-2">Settings</h2>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          className="px-3 py-1 rounded bg-gray-200 text-gray-900 border border-gray-300 hover:bg-gray-100 transition"
          onClick={() => applyTheme(DEFAULT_LIGHT)}
        >
          Default Light
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 transition"
          onClick={() => applyTheme(DEFAULT_DARK)}
        >
          Default Dark
        </button>
      </div>
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
              className="border rounded px-2 py-1 flex-1"
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
              className="w-8 h-8 border rounded"
              // disabled={!/^#([0-9A-Fa-f]{3}){1,2}$/.test(value)}
              title="Pick color"
            />
          </div>
        ))}
      </form>
    </div>
  );
}
