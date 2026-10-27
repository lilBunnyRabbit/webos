import { run_job, type JobUnit } from "$lib/apps/user/pdf-tools/job";
import { PdfWriter } from "$lib/apps/user/pdf-tools/pdf";
import { write_at } from "$lib/apps/user/pdf-tools/pdf-files";
import kernel, { type AppsService } from "$lib/core/api";
import { base_name } from "$lib/core/api/services/files/path";
import { format_bytes } from "$lib/core/utils";
import { APP_ID } from "./ids";
import { page_points } from "./layout";
import type { ScanPage } from "./page.svelte";

export function export_pdf(pages: ScanPage[], target: string): Promise<boolean> {
  const count = pages.length;
  return run_job(
    APP_ID,
    count === 1 ? "Saving the scan" : `Saving ${count} scanned pages`,
    () => {
      const writer = new PdfWriter();
      const units: JobUnit[] = pages.map((page, index) => ({
        name: `Page ${index + 1}`,
        async run() {
          const blob = await page.render();
          if (!blob) throw new Error(page.error ?? `Page ${index + 1} couldn't be straightened`);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const bitmap = await createImageBitmap(blob);
          const size = page_points(bitmap.width, bitmap.height);
          bitmap.close();
          await writer.append_page(size.width, size.height, async (pdf_page, document) => {
            const image = blob.type === "image/png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
            pdf_page.drawImage(image, { x: 0, y: 0, ...size });
          });
          return `${format_bytes(bytes.byteLength)}, ${blob.type === "image/png" ? "PNG" : "JPEG"}`;
        },
      }));
      units.push({
        name: "Write PDF",
        async run() {
          const bytes = await writer.finish();
          await write_at(target, bytes);
          return `Saved ${format_bytes(bytes.byteLength)}`;
        },
      });
      return units;
    },
    () => ({
      title: "Scan saved",
      message: base_name(target),
      actions: [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(target) }],
    })
  );
}
