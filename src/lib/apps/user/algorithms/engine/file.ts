import { z } from "zod";

export const ALGO_EXTENSION = ".algo";

const AlgoFileSchema = z.object({
  version: z.literal(1),
  algorithm: z.string(),
  input: z.unknown(),
  params: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
});

export interface AlgoFile {
  version: 1;
  algorithm: string;
  input: unknown;
  params?: Record<string, number | string>;
}

export function parse_algo_file(text: string): AlgoFile | null {
  try {
    const parsed = AlgoFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data as AlgoFile) : null;
  } catch {
    return null;
  }
}

export function serialize_algo_file(file: AlgoFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}
