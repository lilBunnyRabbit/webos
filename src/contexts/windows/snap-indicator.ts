import type { SnapZone } from "./windows.type";

// Global snap zone state that can be accessed by Window components
const globalSnapZoneListeners: Set<(zone: SnapZone) => void> = new Set();

export function setGlobalSnapZone(zone: SnapZone) {
  globalSnapZoneListeners.forEach((listener) => listener(zone));
}

export function subscribeToSnapZone(listener: (zone: SnapZone) => void) {
  globalSnapZoneListeners.add(listener);
  return () => {
    globalSnapZoneListeners.delete(listener);
  };
}

