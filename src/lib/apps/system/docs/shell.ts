import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type Completion } from "$lib/core/api/services/shell/type";
import { fallback_title, short_name } from "./catalog";
import { ALIASES, locate, near_pages, PAGE_IDS } from "./pages";

export function open_docs(topic: string): void {
  const apps = kernel.service<AppsService>("apps");
  if (!topic.trim()) {
    apps.launch("docs");
    return;
  }
  const page = locate(topic);
  if (!page) {
    const near = near_pages(topic).map((id) => short_name(id, ALIASES));
    throw new ShellError(`no page called "${topic}".${near.length > 0 ? ` Did you mean ${near.join(", ")}?` : ""}`);
  }
  apps.launch("docs", { page: page.hash ? `${page.id}#${page.hash}` : page.id });
}

export function complete_page(partial: string): Completion[] {
  const needle = partial.toLowerCase();
  const seen = new Set<string>();
  const items: Completion[] = [];
  const add = (value: string, id: string) => {
    if (seen.has(value)) return;
    seen.add(value);
    items.push({ value, detail: fallback_title(id) });
  };
  for (const id of PAGE_IDS) {
    const name = short_name(id, ALIASES);
    if (name.toLowerCase().startsWith(needle)) add(name, id);
  }
  for (const id of PAGE_IDS) if (id.toLowerCase().startsWith(needle)) add(id, id);
  for (const [alias, id] of ALIASES) if (!alias.includes(" ") && alias.startsWith(needle)) add(alias, id);
  return items;
}
