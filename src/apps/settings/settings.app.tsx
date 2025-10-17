import { Button } from "@/core/ui/button";
import { APP_VERSION } from "@/core/constants";
import { useVersion } from "@/core/contexts/version";
import { cn } from "@/core/lib/utils";
import { useSettingsStore } from "@/core/stores/settings.store";
import { CheckCircle2, Info, LayoutDashboard, Palette, RefreshCw, RotateCcw } from "lucide-react";
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
  // speed reader light
  ["rgb(255 246 231)", "rgb(100 128 150)", "rgb(219 159 118)", "rgb(172 219 118)", "rgb(219 118 118)"],
  // speed reader dark
  ["rgb(26 43 51)", "rgb(185 182 170)", "rgb(237 203 171)", "rgb(206 237 171)", "rgb(237 171 171)"],
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

type Section = "theme" | "taskbar" | "about";

export default function SettingsApp() {
  const reset = useSettingsStore((state) => state.reset);
  const [activeSection, setActiveSection] = React.useState<Section>("theme");

  React.useEffect(() => {
    console.log("~~~~~~~~~~~~~~~ SettingsApp mounted");
  }, []);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-48 border-r border-foreground/20 bg-background/50">
        <nav className="p-2 space-y-1">
          <button
            onClick={() => setActiveSection("theme")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeSection === "theme"
                ? "bg-primary/20 text-primary"
                : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            <Palette className="w-4 h-4" />
            Theme
          </button>
          <button
            onClick={() => setActiveSection("taskbar")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeSection === "taskbar"
                ? "bg-primary/20 text-primary"
                : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Taskbar
          </button>
          <button
            onClick={() => setActiveSection("about")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeSection === "about"
                ? "bg-primary/20 text-primary"
                : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            <Info className="w-4 h-4" />
            About
          </button>
          <button
            onClick={() => {
              reset();
              useSettingsStore.persist.clearStorage();
            }}
            className="w-full text-accent hover:bg-accent/20 flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Settings
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {activeSection === "theme" && <ThemeSection />}
        {activeSection === "taskbar" && <TaskbarSection />}
        {activeSection === "about" && <AboutSection />}
      </main>
    </div>
  );
}

function ThemeSection() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

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
    setTheme(theme);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Theme Colors</h2>
        <form className="space-y-3">
          {Object.entries(theme).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <label htmlFor={key} className="w-28 capitalize text-sm">
                {key}
              </label>
              <input
                id={key}
                name={key}
                type="text"
                value={value}
                onChange={(e) => setTheme({ [key]: e.target.value })}
                className="border border-foreground/30 rounded px-2 py-1 flex-1 text-sm bg-background"
                style={{
                  background: key === "background" ? value : undefined,
                  color: key === "foreground" ? value : undefined,
                }}
              />
              <input
                type="color"
                defaultValue={value.startsWith("#") ? value : "#000000"}
                onChange={(e) => setTheme({ [key]: e.target.value })}
                className="w-8 h-8 border border-foreground/30 rounded cursor-pointer"
                title="Pick color"
              />
            </div>
          ))}
        </form>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Presets</h2>
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

function TaskbarSection() {
  const taskbar = useSettingsStore((state) => state.taskbar);
  const setTaskbar = useSettingsStore((state) => state.setTaskbar);

  const positions: Array<{ value: "left" | "right" | "top" | "bottom"; label: string }> = [
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Taskbar Position</h2>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {positions.map((pos) => (
            <button
              key={pos.value}
              onClick={() => setTaskbar({ position: pos.value })}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200",
                taskbar.position === pos.value
                  ? "border-primary bg-primary/20 text-primary font-medium"
                  : "border-foreground/20 hover:border-foreground/40 hover:bg-foreground/5"
              )}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutSection() {
  const { newVersion, checkForUpdates, isUpdating, applyUpdate, isCheckingForUpdates } = useVersion();

  const updateStatus = React.useMemo(() => {
    if (isCheckingForUpdates) {
      return "checking";
    }
    if (newVersion) {
      return "available";
    }
    return "up-to-date";
  }, [isCheckingForUpdates, newVersion]);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold mb-4">About WebOS</h2>
        <p className="text-foreground/70 text-sm mb-6">Operating System for the web</p>
      </div>

      {/* Version Information */}
      <div className="space-y-4 p-4 border border-foreground/20 rounded-lg bg-background/50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Version Information</h3>
          {import.meta.env.DEV && (
            <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium">
              DEVELOPMENT
            </span>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-foreground/10">
            <span className="text-foreground/70">Version</span>
            <span className="font-mono font-medium">{APP_VERSION.version}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-foreground/10">
            <span className="text-foreground/70">Commit</span>
            <span className="font-mono text-xs">{APP_VERSION.commit}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-foreground/10">
            <span className="text-foreground/70">Branch</span>
            <span className="font-mono text-xs">{APP_VERSION.branch}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-foreground/10">
            <span className="text-foreground/70">Mode</span>
            <span className="text-xs">{import.meta.env.DEV ? "Development" : "Production"}</span>
          </div>

          <div className="flex justify-between items-center py-2">
            <span className="text-foreground/70">Build Time</span>
            <span className="text-xs">{new Date(APP_VERSION.buildTime).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Update Check */}
      {!import.meta.env.DEV && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Updates</h3>

          <div className="flex items-start gap-4">
            <Button
              onClick={() => checkForUpdates({ cancelRefetch: true })}
              disabled={isCheckingForUpdates}
              className="flex items-center gap-2 bg-primary text-background"
            >
              <RefreshCw className={cn("h-4 w-4", isCheckingForUpdates && "animate-spin")} />
              {isCheckingForUpdates ? "Checking..." : "Check for Updates"}
            </Button>

            {updateStatus === "available" && (
              <div className="flex-1 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-400">Update Available</p>
                    {newVersion && (
                      <p className="text-sm text-foreground/70 mt-1">
                        v{newVersion.version} ({newVersion.commit})
                      </p>
                    )}
                    <Button
                      onClick={() => applyUpdate()}
                      size="sm"
                      disabled={isUpdating}
                      className="mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3 w-3 mr-1", isUpdating && "animate-spin")} />
                      {isUpdating ? "Updating..." : "Refresh to Update"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {updateStatus === "up-to-date" && (
              <div className="flex-1 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <p className="text-green-400 font-medium">You're up to date!</p>
              </div>
            )}

            {updateStatus === "checking" && (
              <div className="flex-1 p-3 border border-foreground/20 rounded-lg flex items-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <p className="text-foreground/70">Checking for updates...</p>
              </div>
            )}
          </div>

          <p className="text-xs text-foreground/60">
            WebOS automatically checks for updates every 5 minutes while running.
          </p>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-sm text-foreground/70">
            <strong className="text-yellow-400">Development Mode:</strong> Automatic update checking is disabled.
            Version checking will be enabled in production builds.
          </p>
        </div>
      )}

      {/* Additional Info */}
      <div className="pt-4 border-t border-foreground/20 space-y-2 text-sm text-foreground/60">
        <p>© 2025 WebOS Project</p>
        <p>
          <a
            href="https://github.com/lilbunnyrabbit/webos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            View on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
