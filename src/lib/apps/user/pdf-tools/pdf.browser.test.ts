import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { PageSize } from "./geometry";
import { initial_pages, insert_blank, move_page, remove_page, rotate_page } from "./pages";
import { EncryptedPdfError, images_to_pdf, load_pdf, merge_pdfs, organize_pdf, page_count, sign_pdf, split_pdf } from "./pdf";
import { build_signature } from "./stroke";

async function make_pdf(labels: string[], size: [number, number] = [200, 300]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const label of labels) document.addPage(size).drawText(label, { x: 20, y: 20, size: 12, font });
  return document.save();
}

function sizes(document: PDFDocument): string[] {
  return document.getPages().map((page) => `${page.getWidth()}x${page.getHeight()}@${page.getRotation().angle}`);
}

describe("pdf operations", () => {
  test("merge keeps every page in order", async () => {
    const a = await make_pdf(["a1", "a2"], [100, 100]);
    const b = await make_pdf(["b1"], [200, 200]);
    const merged = await merge_pdfs([
      { name: "a.pdf", bytes: a },
      { name: "b.pdf", bytes: b },
    ]);
    const document = await load_pdf(merged);
    expect(sizes(document)).toEqual(["100x100@0", "100x100@0", "200x200@0"]);
  });

  test("organize reorders, rotates, deletes and inserts blanks", async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 200]);
    source.addPage([300, 400]).setRotation(degrees(90));
    source.addPage([500, 600]);
    const bytes = await source.save();

    let n = 0;
    const id = () => `p${n++}`;
    let pages = initial_pages(3, id);
    pages = move_page(pages, 2, 0);
    pages = rotate_page(pages, "p1", 90);
    pages = remove_page(pages, "p0");
    pages = insert_blank(pages, 1, id);

    const out = await load_pdf(await organize_pdf(bytes, pages));
    expect(sizes(out)).toEqual(["500x600@0", "500x600@0", "300x400@180"]);
    expect(await page_count(await organize_pdf(bytes, initial_pages(3)))).toBe(3);
  });

  test("split writes one file per group", async () => {
    const bytes = await make_pdf(["1", "2", "3", "4", "5"]);
    const parts: number[][] = [];
    for await (const part of split_pdf(bytes, [[1, 2, 3], [5]])) {
      parts.push(part.pages);
      expect(await page_count(part.bytes)).toBe(part.pages.length);
    }
    expect(parts).toEqual([[1, 2, 3], [5]]);
  });

  test("sign stamps a vector path and the date", async () => {
    const bytes = await make_pdf(["contract"], [600, 800]);
    const signature = build_signature([
      Array.from({ length: 30 }, (_, i) => ({ x: i * 4, y: Math.sin(i / 3) * 10, t: i * 10, pressure: null })),
    ])!;
    const signed = await sign_pdf(bytes, [
      { page: 0, placement: { x: 0.5, y: 0.8, width: 0.3 }, signature, ink: "blue", date: "2026-10-15" },
    ]);
    const document = await load_pdf(signed);
    expect(document.getPageCount()).toBe(1);
    const text = new TextDecoder("latin1").decode(await document.save({ useObjectStreams: false }));
    expect(signed.length).toBeGreaterThan(bytes.length);
    expect(text).toContain("Helvetica");
  });

  test("images become pages sized by the layout", async () => {
    const canvas = new OffscreenCanvas(40, 20);
    canvas.getContext("2d")!.fillRect(0, 0, 40, 20);
    const png = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    const pdf = await images_to_pdf(
      [
        { bytes: png, kind: "png", width: 40, height: 20 },
        { bytes: png, kind: "png", width: 40, height: 20 },
      ],
      PageSize.A4,
      36
    );
    const document = await load_pdf(pdf);
    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getWidth()).toBeCloseTo(841.89);
  });

  test("an encrypted PDF is reported as such", async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const bytes = await document.save({ useObjectStreams: false });
    const text = new TextDecoder("latin1").decode(bytes);
    const marked = text.replace("trailer\n<<", "trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>");
    const encrypted = Uint8Array.from(marked, (char) => char.charCodeAt(0));
    await expect(load_pdf(encrypted, "secret.pdf")).rejects.toBeInstanceOf(EncryptedPdfError);
  });

  test("garbage isn't a PDF", async () => {
    await expect(load_pdf(new TextEncoder().encode("hello"), "x.pdf")).rejects.toThrow("couldn't be read as a PDF");
  });
});
