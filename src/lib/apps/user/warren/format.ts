import { BUILTIN_FONTS, is_font_file_name } from "$lib/core/api/services/settings/fonts";
import { z } from "zod";
import { DEFAULT_PAGE, FLOWS, MARGIN_MAX, ORIENTATIONS, PAGE_SIZES, type PageSettings } from "./page";
import { clean_spec, STYLE_IDS, type StyleOverrides } from "./styles";

// 2 added `page.font` and link nodes; 3 added `goal`, horizontal rules, check lists and sub/superscript; 4 added images,
// `page.orientation`, `page.margins`, `header` and `footer`; 5 added tables, title and quote blocks, text colour and
// highlight, and `styles`. Older files read as they are.
export const VERSION = 5;
export const EXTENSION = ".warren";
export const GOAL_MAX = 1_000_000;

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
  url?: string;
  checked?: boolean;
  src?: string;
  width?: number;
  align?: string;
  alt?: string;
  colSpan?: number;
  rowSpan?: number;
  headerState?: number;
  colWidths?: number[];
  /** Lexical's NodeState that isn't flat: a table's `borders`. */
  $?: Record<string, unknown>;
}

export interface EditorJson {
  root: DocNode & { type: "root"; children: DocNode[] };
}

export interface WarrenDocument {
  version: typeof VERSION;
  page: PageSettings;
  /** Word goal, shown as progress in the status bar. */
  goal?: number;
  /** Named paragraph styles, only what differs from Warren's defaults. */
  styles?: StyleOverrides;
  header?: EditorJson;
  footer?: EditorJson;
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
      url: z.string().optional(),
      checked: z.boolean().optional(),
      src: z.string().optional(),
      width: z.number().optional(),
      align: z.string().optional(),
      alt: z.string().optional(),
      colSpan: z.number().optional(),
      rowSpan: z.number().optional(),
      headerState: z.number().optional(),
      colWidths: z.array(z.number()).optional(),
      $: z.record(z.string(), z.unknown()).optional(),
    })
    .loose()
);

const FontSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }),
  z.object({ kind: z.literal("builtin"), id: z.string().refine((id) => id in BUILTIN_FONTS, "isn't a built-in font") }),
  z.object({ kind: z.literal("file"), name: z.string().refine(is_font_file_name, "isn't a font file name") }),
]);

const Millimetres = z.number().min(0).max(MARGIN_MAX);

const StylesSchema = z.partialRecord(z.enum(STYLE_IDS), z.record(z.string(), z.unknown()));

const EditorSchema = z.object({ root: z.object({ type: z.literal("root"), children: z.array(NodeSchema) }).loose() }).loose();

const DocumentSchema = z.object({
  version: z.number().int().min(1),
  page: z.object({
    size: z.enum(PAGE_SIZES),
    flow: z.enum(FLOWS),
    font: FontSchema.optional(),
    orientation: z.enum(ORIENTATIONS).optional(),
    margins: z.object({ top: Millimetres, right: Millimetres, bottom: Millimetres, left: Millimetres }).optional(),
  }),
  goal: z.number().int().positive().max(GOAL_MAX).optional(),
  styles: StylesSchema.optional(),
  header: EditorSchema.optional(),
  footer: EditorSchema.optional(),
  editor: EditorSchema,
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

function clean_styles(styles: Partial<Record<string, Record<string, unknown>>> | undefined): StyleOverrides | undefined {
  const clean: StyleOverrides = {};
  for (const id of STYLE_IDS) {
    const fields = styles?.[id] && clean_spec(styles[id]);
    if (fields && Object.keys(fields).length) clean[id] = fields;
  }
  return Object.keys(clean).length ? clean : undefined;
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
  const { font, orientation, margins, ...page } = result.data.page;
  const { goal, header, footer } = result.data;
  const styles = clean_styles(result.data.styles);
  return {
    version: VERSION,
    page: {
      ...page,
      ...(font && font.kind !== "default" ? { font } : {}),
      ...(orientation === "landscape" ? { orientation } : {}),
      ...(margins ? { margins } : {}),
    },
    ...(goal ? { goal } : {}),
    ...(styles ? { styles } : {}),
    ...(header ? { header: header as EditorJson } : {}),
    ...(footer ? { footer: footer as EditorJson } : {}),
    editor: result.data.editor as EditorJson,
  };
}

export function serialize_document(document: WarrenDocument): string {
  return JSON.stringify({
    version: VERSION,
    page: document.page,
    goal: document.goal,
    styles: document.styles,
    header: document.header,
    footer: document.footer,
    editor: document.editor,
  });
}
