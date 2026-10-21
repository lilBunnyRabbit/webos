import kernel, { type AppsService } from "$lib/core/api";
import { ShellError } from "$lib/core/api/services/shell/type";
import { is_page, find_setting, search_settings } from "./search";

export function open_settings(id: string | undefined): void {
  const apps = kernel.service<AppsService>("apps");
  if (!id) {
    apps.launch("settings");
    return;
  }
  const entry = find_setting(id, kernel.platform);
  if (!entry) {
    const near = search_settings(id.replaceAll("-", " "), kernel.platform).slice(0, 3);
    throw new ShellError(`no setting called "${id}".${near.length > 0 ? ` Did you mean ${near.map((item) => item.id).join(", ")}?` : ""}`);
  }
  apps.launch("settings", is_page(entry) ? { section: entry.page } : { section: entry.page, setting: entry.id });
}
