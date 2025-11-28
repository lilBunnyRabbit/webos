import { Kernel } from "./kernel";

export * from "./kernel";
export * from "./services";
export * from "./type";

// Reuse existing kernel instance during HMR, otherwise create new one
const kernel = 
  (typeof window !== "undefined" && (window as unknown as { kernel?: Kernel }).kernel) ||
  new Kernel();

// Always update window reference to ensure it's current
if (typeof window !== "undefined") {
  (window as unknown as { kernel: Kernel }).kernel = kernel;
}

export default kernel;
