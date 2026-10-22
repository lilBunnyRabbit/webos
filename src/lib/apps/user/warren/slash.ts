export const SlashCommand = {
  TEXT: "text",
  TITLE: "title",
  H1: "h1",
  H2: "h2",
  H3: "h3",
  BULLETS: "bullets",
  NUMBERS: "numbers",
  CHECKLIST: "checklist",
  QUOTE: "quote",
  RULE: "rule",
  TABLE: "table",
  PICTURE: "picture",
  PAGE_BREAK: "page-break",
  TEMPLATE: "template",
} as const;
export type SlashCommand = (typeof SlashCommand)[keyof typeof SlashCommand];

export interface SlashItem {
  id: SlashCommand;
  label: string;
  hint: string;
  keywords: readonly string[];
}

export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: SlashCommand.TEXT, label: "Text", hint: "Normal paragraph", keywords: ["paragraph", "normal", "plain", "body"] },
  { id: SlashCommand.TITLE, label: "Title", hint: "The document's name", keywords: ["name"] },
  { id: SlashCommand.H1, label: "Heading 1", hint: "#", keywords: ["h1", "#"] },
  { id: SlashCommand.H2, label: "Heading 2", hint: "##", keywords: ["h2", "##", "subheading"] },
  { id: SlashCommand.H3, label: "Heading 3", hint: "###", keywords: ["h3", "###"] },
  { id: SlashCommand.BULLETS, label: "Bullets", hint: "-", keywords: ["bulleted", "list", "ul", "unordered", "-"] },
  { id: SlashCommand.NUMBERS, label: "Numbers", hint: "1.", keywords: ["numbered", "list", "ol", "ordered", "1."] },
  { id: SlashCommand.CHECKLIST, label: "Checklist", hint: "[ ]", keywords: ["todo", "tasks", "checkbox", "list", "[]"] },
  { id: SlashCommand.QUOTE, label: "Quote", hint: ">", keywords: ["blockquote", "citation", ">"] },
  { id: SlashCommand.RULE, label: "Rule", hint: "---", keywords: ["horizontal", "line", "divider", "separator", "hr", "---"] },
  { id: SlashCommand.TABLE, label: "Table…", hint: "Rows and columns", keywords: ["grid", "columns", "rows"] },
  { id: SlashCommand.PICTURE, label: "Picture…", hint: "From the device or files", keywords: ["image", "photo", "img", "camera"] },
  { id: SlashCommand.PAGE_BREAK, label: "Page break", hint: "Start a new page", keywords: ["new page", "break"] },
  { id: SlashCommand.TEMPLATE, label: "Template…", hint: "Start from a template", keywords: ["cv", "resume", "letter", "report"] },
];

function rank(item: SlashItem, query: string): number | null {
  const label = item.label.toLowerCase().replace("…", "");
  if (label.startsWith(query)) return 0;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (item.keywords.some((keyword) => keyword.startsWith(query))) return 2;
  if (query.length > 2 && label.includes(query)) return 3;
  return null;
}

export function filter_slash(query: string, items: readonly SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return [...items];
  return items
    .map((item, index) => ({ item, index, rank: rank(item, wanted) }))
    .filter((entry): entry is { item: SlashItem; index: number; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
