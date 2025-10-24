export interface TaskbarSettings {
  position: "left" | "right" | "top" | "bottom";
}

export const taskbar = $state<TaskbarSettings>({ position: "bottom" });
