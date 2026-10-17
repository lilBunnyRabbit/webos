export const APP_ID = "recipe-box";
export const COOK_FILES = [".cook"];

export const UnitSystem = { WRITTEN: "written", METRIC: "metric", IMPERIAL: "imperial" } as const;
export type UnitSystem = (typeof UnitSystem)[keyof typeof UnitSystem];
