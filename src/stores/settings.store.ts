import { create } from "zustand";
import { persist } from "zustand/middleware";

// TODO: Move

const updateTheme = (theme: Partial<SettingsState["theme"]>) => {
  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
};

// ---

interface SettingsState {
  theme: {
    background: string;
    foreground: string;
    primary: string;
    secondary: string;
    accent: string;
  };
  taskbar: {
    position: "left" | "right" | "top" | "bottom";
  };
}

interface SettingsActions {
  setTheme: (theme: Partial<SettingsState["theme"]>) => void;
  setTaskbar: (taskbar: Partial<SettingsState["taskbar"]>) => void;
  reset: () => void;
}

interface SettingsStore extends SettingsState, SettingsActions {}

const computed = getComputedStyle(document.documentElement);

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: {
        background: computed.getPropertyValue("--background").trim(),
        foreground: computed.getPropertyValue("--foreground").trim(),
        primary: computed.getPropertyValue("--primary").trim(),
        secondary: computed.getPropertyValue("--secondary").trim(),
        accent: computed.getPropertyValue("--accent").trim(),
      },
      taskbar: {
        position: "bottom",
      },
      setTheme: (theme) => {
        updateTheme(theme);

        return set((state) => ({ theme: { ...state.theme, ...theme } }));
      },
      setTaskbar: (taskbar) => set((state) => ({ taskbar: { ...state.taskbar, ...taskbar } })),
      reset: () => {
        const initialState = useSettingsStore.getInitialState();
        updateTheme(initialState.theme);
        set(initialState);
      },
    }),
    {
      name: "settings",
    }
  )
);

updateTheme(useSettingsStore.getState().theme);
