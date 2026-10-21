import { z } from "zod";
import { DEFAULT_PAGE, FLOWS, PAGE_SIZES, type PageSettings } from "./page";

export const VERSION = 1;
export const EXTENSION = ".warren";

// Read loosely: the shell and the exports walk the JSON without loading Lexical.
export interface DocNode {
  type: string;
  children?: DocNode[];
  text?: string;
  format?: number | string;
  style?: string;
  tag?: string;
  listType?: string;
  start?: number;
}

export interface EditorJson {
  root: DocNode & { type: "root"; children: DocNode[] };
}

export interface WarrenDocument {
  version: typeof VERSION;
  page: PageSettings;
  editor: EditorJson;
}

const NodeSchema: z.ZodType<DocNode> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      children: z.array(NodeSchema).optional(),
      text: z.string().optional(),
      format: z.union([z.number(), z.string()]).optional(),
      style: z.string().optional(),
      tag: z.string().optional(),
      listType: z.string().optional(),
      start: z.number().optional(),
    })
    .loose()
);

const DocumentSchema = z.object({
  version: z.number().int().min(1),
  page: z.object({ size: z.enum(PAGE_SIZES), flow: z.enum(FLOWS) }),
  editor: z.object({ root: z.object({ type: z.literal("root"), children: z.array(NodeSchema) }).loose() }).loose(),
});

export function empty_editor(): EditorJson {
  return {
    root: {
      type: "root",
      children: [{ type: "paragraph", children: [], format: "", indent: 0, direction: null, textFormat: 0, textStyle: "", version: 1 } as DocNode],
      format: "",
      indent: 0,
      direction: null,
      version: 1,
    } as EditorJson["root"],
  };
}

export function create_document(): WarrenDocument {
  return { version: VERSION, page: { ...DEFAULT_PAGE }, editor: empty_editor() };
}

export function parse_document(text: string): WarrenDocument {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Warren document: it isn't JSON");
  }
  const version = (json as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > VERSION) {
    throw new Error(`This document was made by a newer Warren (format ${version})`);
  }
  const result = DocumentSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`This isn't a valid Warren document: ${issue.path.join(".") || "root"} ${issue.message}`);
  }
  return { version: VERSION, page: result.data.page, editor: result.data.editor as EditorJson };
}

export function serialize_document(document: WarrenDocument): string {
  return JSON.stringify({ version: VERSION, page: document.page, editor: document.editor });
}
