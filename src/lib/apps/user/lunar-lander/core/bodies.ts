export const BodyId = { MOON: "moon", MARS: "mars", EARTH: "earth" } as const;
export type BodyId = (typeof BodyId)[keyof typeof BodyId];

export const BODY_IDS = [BodyId.MOON, BodyId.MARS, BodyId.EARTH] as const;

export interface Body {
  id: BodyId;
  name: string;
  g: number;
  rho: number;
}

export const BODIES: Record<BodyId, Body> = {
  [BodyId.MOON]: { id: BodyId.MOON, name: "Moon", g: 1.62, rho: 0 },
  [BodyId.MARS]: { id: BodyId.MARS, name: "Mars", g: 3.71, rho: 0.02 },
  [BodyId.EARTH]: { id: BodyId.EARTH, name: "Earth", g: 9.81, rho: 1.225 },
};
