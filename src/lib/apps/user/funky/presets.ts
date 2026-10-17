import type { Value } from "./simulator";

export interface SimSetup {
  preset: string;
  script: string;
  plot: string[];
}

export interface Preset {
  id: string;
  label: string;
  world: Record<string, Value>;
}

export const PRESETS: Preset[] = [
  {
    id: "cruise",
    label: "Cruise",
    world: { Altitude: 1000, AltitudeAgl: 1000, IAS: 120, TAS: 126, GS: 120, Throttle: 0.7, Fuel: 0.8, GearDown: -1, VerticalG: 1, GForce: 1 },
  },
  {
    id: "takeoff",
    label: "Takeoff roll",
    world: { Altitude: 5, AltitudeAgl: 0.8, IAS: 40, TAS: 40, GS: 40, Throttle: 1, GearDown: 1, Brake: 0, VerticalG: 1, GForce: 1 },
  },
  {
    id: "hover",
    label: "Hover",
    world: { Altitude: 30, AltitudeAgl: 20, IAS: 0, TAS: 0, GS: 0, VerticalSpeed: 0, Throttle: 0.5, VTOL: 1, GearDown: 1, VerticalG: 1, GForce: 1 },
  },
  {
    id: "approach",
    label: "Approach",
    world: { Altitude: 150, AltitudeAgl: 150, IAS: 60, TAS: 61, GS: 60, VerticalSpeed: -4, Throttle: 0.3, GearDown: -1, PitchAngle: -3, VerticalG: 1, GForce: 1 },
  },
  {
    id: "target",
    label: "Target ahead",
    world: {
      Altitude: 1500,
      AltitudeAgl: 1500,
      IAS: 180,
      Heading: 0,
      PitchAngle: 0,
      TargetSelected: 1,
      TargetHeading: 2,
      TargetElevation: 1,
      TargetDistance: 600,
      SelectedWeapon: "Boom 50",
      Ammo: 4,
      VerticalG: 1,
      GForce: 1,
    },
  },
  {
    id: "turn",
    label: "Hard turn",
    world: { Altitude: 2000, AltitudeAgl: 2000, IAS: 150, Roll: 1, RollAngle: 70, Heading: 40, YawRate: 12, VerticalG: 4.5, GForce: 4.8 },
  },
];

export const PRESETS_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));
