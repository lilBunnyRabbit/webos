import kernel, { Platform, type AppsService, type FilesService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { kind_of_file, RECORDINGS_DIR, Source } from "./media";
import type { SOURCES } from "./props";
import { list_recordings } from "./recordings";

const APP_ID = "recorder";
const apps = () => kernel.service<AppsService>("apps");

export async function* list(): AsyncGenerator<Tagged> {
  for (const item of await list_recordings(kernel.service<FilesService>("files"))) {
    yield {
      $type: "recording",
      name: item.name,
      path: `${RECORDINGS_DIR}/${item.name}`,
      kind: kind_of_file(item.name),
      size: item.size ?? null,
      date: item.last_modified ?? null,
    };
  }
}

export function open_recording(path: string): void {
  apps().launch("media-preview", { path });
}

export function start({ args }: CommandContext<{ source: (typeof SOURCES)[number] }>): string {
  if (args.source === Source.SCREEN && (kernel.platform === Platform.MOBILE || typeof navigator.mediaDevices?.getDisplayMedia !== "function")) {
    throw new ShellError("screen recording isn't available on this device");
  }
  apps().launch(APP_ID, { source: args.source });
  return `Recorder is ready: click ${args.source === Source.SCREEN ? "Share and record" : "Record"} to start`;
}
