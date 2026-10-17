export const APP_ID = "qr-studio";

export const View = {
  MAKE: "make",
  HOW: "how",
} as const;
export type View = (typeof View)[keyof typeof View];

export const SAMPLE_TEXT = "https://lilbunnyrabbit.github.io";

export const HOW_LIMIT = 600;
