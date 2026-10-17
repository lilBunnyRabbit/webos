import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type Tagged } from "$lib/core/api/services/shell/type";
import { extended_name } from "./usages";
import { count_collections, device_ids, device_name, get_hid } from "./webhid";

export async function ls(): Promise<Tagged[]> {
  const hid = get_hid();
  if (!hid) throw new ShellError("hid ls: WebHID isn't available in this browser");
  const devices = await hid.getDevices();
  return devices.map((device) => {
    const top = device.collections[0];
    return {
      $type: "hid-device",
      name: device_name(device),
      ids: device_ids(device),
      usage: top ? extended_name(top.usagePage * 0x10000 + top.usage) : "—",
      collections: count_collections(device.collections),
      opened: device.opened,
    };
  });
}

export function open(): void {
  kernel.service<AppsService>("apps").launch("hid-lab", { section: "hid" });
}
