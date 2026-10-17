import { z } from "zod";

export const PAYLOAD_PREFIX = "v1";

const payload = z.string().regex(new RegExp(`^${PAYLOAD_PREFIX}[\\w-]+$`));

/** `f` is a shared form, `a` an answer sent back, both packed by `link.ts`. */
export const FORMS_PROPS = z.object({
  path: z.string().optional(),
  f: payload.optional(),
  a: payload.optional(),
});
export type FormsProps = z.infer<typeof FORMS_PROPS>;
