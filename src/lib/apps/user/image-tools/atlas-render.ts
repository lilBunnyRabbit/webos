import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { base_name } from "$lib/core/api/services/files/path";
import { format_bytes } from "$lib/core/utils";
import { write_at } from "$lib/core/utils/zip/files";
import { Method } from "$lib/core/utils/zip/format";
import { ZipWriter } from "$lib/core/utils/zip/write";
import { AtlasFormat, atlas_css, atlas_json, type AtlasFrame, type Rect, type Size } from "./atlas";

export interface SheetFrame {
  image: CanvasImageSource;
  crop: Rect;
  at: { x: number; y: number };
}

export function draw_sheet(sheet: Size, frames: SheetFrame[], extrude: number, scale = 1): OffscreenCanvas {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(sheet.w * scale)), Math.max(1, Math.round(sheet.h * scale)));
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  for (const { image, crop, at } of frames) {
    const { x, y, w, h } = crop;
    context.imageSmoothingEnabled = scale !== 1;
    context.drawImage(image, x, y, w, h, at.x, at.y, w, h);
    if (extrude <= 0) continue;
    // A one-pixel strip stretched over the extrude has to stay hard: smoothing would blend it into its neighbours.
    context.imageSmoothingEnabled = false;
    const e = extrude;
    const strips: [number, number, number, number, number, number, number, number][] = [
      [x, y, w, 1, at.x, at.y - e, w, e],
      [x, y + h - 1, w, 1, at.x, at.y + h, w, e],
      [x, y, 1, h, at.x - e, at.y, e, h],
      [x + w - 1, y, 1, h, at.x + w, at.y, e, h],
      [x, y, 1, 1, at.x - e, at.y - e, e, e],
      [x + w - 1, y, 1, 1, at.x + w, at.y - e, e, e],
      [x, y + h - 1, 1, 1, at.x - e, at.y + h, e, e],
      [x + w - 1, y + h - 1, 1, 1, at.x + w, at.y + h, e, e],
    ];
    for (const strip of strips) context.drawImage(image, ...strip);
  }
  return canvas;
}

export const ATLAS_IMAGE = "atlas.png";

/** The sheet comes drawn, so removing frames while a big one encodes, or on Retry, can't break it. */
export async function export_atlas(app_id: AppId, sheet: OffscreenCanvas, frames: AtlasFrame[], format: AtlasFormat, target: string): Promise<boolean> {
  let size = 0;
  const job = kernel.service<TasksService>("tasks").run(
    app_id,
    (context) => {
      const encode = createTask<void, Blob>({
        name: `Encode ${ATLAS_IMAGE}`,
        parse() {
          return { status: `${sheet.width} × ${sheet.height} px` };
        },
        async execute() {
          context.message(`Encoding ${sheet.width} × ${sheet.height} px`);
          return sheet.convertToBlob({ type: "image/png" });
        },
      });
      const write = createTask<void, void>({
        name: "Write archive",
        async execute() {
          context.signal.throwIfAborted();
          context.message(`Writing ${base_name(target)}`);
          const png = this.query.getResult(encode);
          const data =
            format === AtlasFormat.JSON
              ? { name: "atlas.json", text: atlas_json(frames, ATLAS_IMAGE, { w: sheet.width, h: sheet.height }) }
              : { name: "atlas.css", text: atlas_css(frames, ATLAS_IMAGE) };
          const writer = new ZipWriter(Method.DEFLATE);
          await writer.add({ name: ATLAS_IMAGE, data: png }, { signal: context.signal });
          await writer.add({ name: data.name, data: new Blob([data.text]) }, { signal: context.signal });
          const zip = writer.finish();
          await write_at(target, zip);
          size = zip.size;
          context.message(null);
          this.logger.info(`${target} · ${format_bytes(zip.size)}`);
        },
      });
      return createTaskGroup({ name: `Pack ${frames.length} frames`, tasks: () => [encode(), write()] })();
    },
    {
      title: `Saving ${base_name(target)}`,
      done: () => ({
        title: "Atlas saved",
        message: `${target} · ${format_bytes(size)}`,
        actions: [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(target) }],
      }),
    }
  );
  await job.done;
  return job.status === TaskJobStatus.DONE;
}
