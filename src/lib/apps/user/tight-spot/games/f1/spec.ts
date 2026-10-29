import { F1_CAR, type VehicleSpec } from "../../core/vehicle";

// Racing grip, far above the core's road default.
export const A_LAT = 25;

// The race tune of the garage's F1 car, which keeps its parking pace.
export const SPEC: VehicleSpec = { ...F1_CAR, max_forward: 80, accel: 15, brake: 36, steer_time: 0.6, a_lat: A_LAT };
export const GRASS_SPEC: VehicleSpec = { ...SPEC, max_forward: 25, rolling: 8 };
