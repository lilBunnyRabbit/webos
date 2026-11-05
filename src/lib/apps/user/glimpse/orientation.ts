export type Turn = 0 | 1 | 2 | 3;

// Below this the phone lies about flat and gravity says nothing about which edge is up.
const MIN_TILT = 4;

// Same sense as `screen.orientation.angle`: 90 = top turned to the left.
export function device_angle(x: number | null, y: number | null): number | null {
  if (x === null || y === null || Math.hypot(x, y) < MIN_TILT) return null;
  const degrees = (Math.atan2(x, y) * 180) / Math.PI;
  return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

/**
 * Chrome turns camera frames to match the screen, so a frame only needs turning by how far the device is turned past
 * the screen: a phone held sideways with the screen locked to portrait.
 */
export function photo_turn(device: number, screen: number): Turn {
  return ((((screen - device) / 90) % 4) + 4) % 4 as Turn;
}
