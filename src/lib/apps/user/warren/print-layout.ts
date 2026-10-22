import type { WarrenDocument } from "./format";
import { geometry } from "./page";
import { has_zones, NO_FONTS, print_document, zone_padding, type PrintFonts, type PrintLayout } from "./print";

const PX_PER_MM = 96 / 25.4;

function load_frame(html: string, width_mm: number): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = `position:fixed;inset-inline-start:-100000px;top:0;width:${Math.ceil(width_mm * PX_PER_MM)}px;height:400px;border:0;visibility:hidden`;
    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error("Couldn't lay the pages out"));
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

/**
 * Lays the print page out once on screen: the header's and footer's heights set where the body starts and ends, then
 * the body in page-tall columns counts the pages, which Chrome fragments the same way it fragments printed pages.
 */
export async function measure_layout(document_: WarrenDocument, inter_url: string, fonts: PrintFonts = NO_FONTS): Promise<PrintLayout | null> {
  if (!has_zones(document_)) return null;
  const page = geometry(document_.page);
  const frame = await load_frame(print_document(document_, "", inter_url, fonts, "measure"), page.width);
  try {
    const target = frame.contentDocument!;
    await target.fonts.ready;
    await Promise.all([...target.images].map((image) => image.decode().catch(() => undefined)));
    const height = (selector: string) => (target.querySelector(selector)?.getBoundingClientRect().height ?? 0) / PX_PER_MM;
    const { top, bottom } = zone_padding(document_, height(".zone.head"), height(".zone.foot"));
    const body = target.querySelector<HTMLElement>(".doc")!;
    body.style.paddingTop = `${top}mm`;
    body.style.paddingBottom = `${bottom}mm`;
    target.documentElement.classList.replace("measure", "paginate");
    return { pages: Math.max(1, body.getClientRects().length), top, bottom };
  } finally {
    frame.remove();
  }
}

export async function printable(document_: WarrenDocument, title: string, inter_url: string, fonts: PrintFonts = NO_FONTS): Promise<string> {
  const layout = await measure_layout(document_, inter_url, fonts);
  return print_document(document_, title, inter_url, fonts, layout);
}
