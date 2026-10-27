import kernel, { type AppsService, type DialogsService, type WindowId, type WindowsService } from "$lib/core/api";

/**
 * Another app's sheet over `window` (ADR-079): the provider's manifest from the catalogue (fetched when this device
 * doesn't know the app), its sheet's code, then the window sheet. `null` when anything is missing.
 */
export async function open_app_sheet(window: WindowId, key: string, input: unknown): Promise<unknown> {
  const split = key.indexOf("::");
  if (split < 0) return null;
  const [app_id, kind] = [key.slice(0, split), key.slice(split + 2)];
  const apps = kernel.service<AppsService>("apps");
  if (!apps.get(app_id)) await apps.catalogue();
  const loader = (await apps.load(app_id))?.provides?.[kind];
  if (!loader) return null;
  const sheet = (await loader()).default;
  if (!kernel.service<WindowsService>("windows").get(window)) return null;
  return kernel.service<DialogsService>("dialogs").show(sheet, { input: input as never }, { window });
}
