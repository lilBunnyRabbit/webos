import kernel, { NotificationType, type AppId, type AppsService, type MenuItem, type NotificationsService, type OfflineService } from "$lib/core/api";
import { Check as CheckIcon, CloudArrowDown as CloudArrowDownIcon } from "phosphor-svelte";

const offline = () => kernel.service<OfflineService>("offline");
const apps = () => kernel.service<AppsService>("apps");

export const KEEP_OFFLINE_ID = "keep-offline";
export const OFFLINE_NOTE = "Apps open offline only once they're saved on this device. Choose which ones stay in Settings › Offline.";

export function open_offline_settings(): void {
  apps().launch("settings", { section: "offline" });
}

export function keep_offline_item(id: AppId): MenuItem[] {
  if (apps().get(id)?.system !== false) return [];
  const kept = offline().is_picked(id);
  return [{ id: KEEP_OFFLINE_ID, label: "Keep offline", icon: kept ? CheckIcon : CloudArrowDownIcon }];
}

export function toggle_keep_offline(id: AppId): void {
  offline().set_picked(id, !offline().is_picked(id));
}

export function explain_offline(id: AppId): void {
  const name = apps().get(id)?.name ?? id;
  kernel.service<NotificationsService>("notifications").notify("offline", {
    type: NotificationType.WARNING,
    title: `${name} isn't saved for offline`,
    message: OFFLINE_NOTE,
    actions: [{ label: "Choose apps", on_click: open_offline_settings }],
  });
}

/** Launches the app, or says why it can't open while offline. */
export function launch_or_explain(id: AppId): void {
  if (offline().can_open(id)) apps().launch(id);
  else explain_offline(id);
}
