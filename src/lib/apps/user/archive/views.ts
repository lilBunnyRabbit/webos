export const APP_ID = "archive";

export const View = {
  BROWSE: "browse",
  CREATE: "create",
  HOW: "how",
} as const;
export type View = (typeof View)[keyof typeof View];

export const SAMPLE_TEXT =
  "How much wood would a woodchuck chuck if a woodchuck could chuck wood? A woodchuck would chuck as much wood as a woodchuck could chuck if a woodchuck could chuck wood.";

export const HOW_LIMIT = 4000;
