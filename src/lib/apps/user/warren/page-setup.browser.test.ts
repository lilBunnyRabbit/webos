import { describe, expect, test } from "vitest";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { build_docx } from "./docx";
import { docx_to_html } from "./docx-import";
import { WarrenEditor, Zone } from "./editor.svelte";
import { PIXEL, SAMPLE_V4 } from "./fixture";
import { parse_document, serialize_document } from "./format";
import { blocks_of, document_text } from "./model";
import { measure_layout } from "./print-layout";
import { BUILTIN_TEMPLATES } from "./templates";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function mounted() {
  const editor = new WarrenEditor((error) => {
    throw error;
  });
  const roots = [Zone.BODY, Zone.HEADER, Zone.FOOTER].map((zone) => {
    const root = document.createElement("div");
    root.contentEditable = "true";
    document.body.append(root);
    return { root, stop: editor.mount(root, zone) };
  });
  return {
    editor,
    roots: roots.map((item) => item.root),
    dispose: () => {
      for (const item of roots) (item.stop(), item.root.remove());
      editor.destroy();
    },
  };
}

async function picture(width: number, height: number): Promise<File> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3a6";
  context.fillRect(0, 0, width, height);
  return new File([await canvas.convertToBlob({ type: "image/png" })], "photo.png", { type: "image/png" });
}

describe("header, footer and pictures in the editor", () => {
  test("load and save the header, footer, pictures and page setup unchanged", async () => {
    const { editor, roots, dispose } = mounted();
    editor.load(SAMPLE_V4);
    await tick();
    expect(roots[1].querySelector(".wr-image img")?.getAttribute("src")).toBe(PIXEL);
    expect(roots[2].textContent).toBe("Page {page} of {pages}");
    const saved = parse_document(serialize_document(editor.snapshot()));
    expect(saved.page).toEqual(SAMPLE_V4.page);
    expect(blocks_of(saved.header!)).toEqual(blocks_of(SAMPLE_V4.header!));
    expect(blocks_of(saved.editor)).toEqual(blocks_of(SAMPLE_V4.editor));
    expect(editor.page_numbers).toEqual({ zone: "footer", align: "center" });
    expect(editor.dirty).toBe(false);
    dispose();
  });

  test("page numbers move between header and footer; switching a zone off drops it", async () => {
    const { editor, dispose } = mounted();
    editor.reset();
    editor.set_page_numbers({ zone: Zone.HEADER, align: "right" });
    await tick();
    expect(editor.has(Zone.HEADER)).toBe(true);
    expect(editor.page_numbers).toEqual({ zone: "header", align: "right" });
    editor.set_page_numbers({ zone: Zone.FOOTER, align: "center" });
    await tick();
    expect(editor.page_numbers).toEqual({ zone: "footer", align: "center" });
    expect(editor.zone_empty(Zone.HEADER)).toBe(true);
    editor.set_zone(Zone.FOOTER, false);
    await tick();
    expect(editor.page_numbers).toBeNull();
    expect(editor.snapshot().footer).toBeUndefined();
    expect(editor.dirty).toBe(true);
    dispose();
  });

  test("the toolbar follows the zone being edited", async () => {
    const { editor, roots, dispose } = mounted();
    editor.load(SAMPLE_V4);
    await tick();
    roots[2].focus();
    roots[2].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(editor.active).toBe(Zone.FOOTER);
    editor.focus();
    await tick();
    editor.insert_token("{pages}");
    await tick();
    expect(editor.snapshot().footer && document_text(editor.snapshot().footer!)).toContain("{pages}");
    expect(document_text(editor.json)).toBe("Report\nBody text");
    dispose();
  });

  test("a picture goes in at its print size, capped at the column, and its width and alignment change", async () => {
    const { editor, dispose } = mounted();
    editor.reset();
    editor.focus(Zone.BODY);
    await editor.insert_pictures([await picture(321, 100)]);
    await tick();
    const [image] = blocks_of(editor.json).filter((block) => block.kind === "image");
    expect(image).toMatchObject({ kind: "image", align: "center" });
    expect(image.kind === "image" && image.width).toBe(Math.round((321 / ((170 * 96) / 25.4)) * 100));
    await editor.insert_pictures([await picture(4000, 1000)]);
    await tick();
    const images = blocks_of(editor.json).filter((block) => block.kind === "image");
    expect(images).toHaveLength(2);
    expect(images[1].kind === "image" && images[1].src.startsWith("data:image/webp")).toBe(true);
    expect(images[1].kind === "image" && images[1].width).toBe(100);
    dispose();
  });
});

describe("templates", () => {
  test.each(BUILTIN_TEMPLATES.map((template) => [template.name, template]))("%s opens in the editor", async (_name, template) => {
    const document = await template.load();
    const { editor, dispose } = mounted();
    editor.load(document);
    await tick();
    expect(document_text(editor.json).length).toBeGreaterThan(100);
    expect(document_text(editor.json)).not.toMatch(/lorem/i);
    expect(blocks_of(parse_document(serialize_document(editor.snapshot())).editor)).toEqual(blocks_of(document.editor));
    dispose();
  });
});

describe(".docx with pictures, header and footer", () => {
  async function parts(blob: Blob) {
    const archive = await read_zip(blob);
    const text = new Map<string, string>();
    for (const entry of archive.entries) if (!entry.name.startsWith("word/media/")) text.set(entry.name, await (await entry_blob(blob, entry)).text());
    return { names: archive.entries.map((entry) => entry.name), text };
  }

  test("every part is well-formed, wired and in the schema's order", async () => {
    const { names, text } = await parts(await build_docx(SAMPLE_V4, "Report"));
    expect(names).toEqual(expect.arrayContaining(["word/header1.xml", "word/footer1.xml", "word/_rels/header1.xml.rels", "word/media/image1.png"]));
    const parse = (name: string) => {
      const xml = new DOMParser().parseFromString(text.get(name)!, "application/xml");
      expect(xml.querySelector("parsererror"), name).toBeNull();
      return xml;
    };
    const types = parse("[Content_Types].xml");
    const overrides = [...types.getElementsByTagName("Override")].map((item) => item.getAttribute("PartName"));
    for (const name of names) {
      if (name.endsWith(".rels") || name.startsWith("word/media/") || name === "[Content_Types].xml") continue;
      expect(overrides, name).toContain(`/${name}`);
    }
    const defaults = [...types.getElementsByTagName("Default")].map((item) => item.getAttribute("Extension"));
    expect(defaults).toContain("png");

    for (const rels of names.filter((name) => name.endsWith(".rels"))) {
      const base = rels.replace(/_rels\/[^/]+$/, "");
      for (const relationship of parse(rels).getElementsByTagName("Relationship")) {
        if (relationship.getAttribute("TargetMode") === "External") continue;
        expect(names, `${rels} → ${relationship.getAttribute("Target")}`).toContain(`${base}${relationship.getAttribute("Target")}`);
      }
    }
    for (const part of ["word/document.xml", "word/header1.xml"]) {
      const ids = new Set([...parse(part.replace("word/", "word/_rels/") + ".rels").getElementsByTagName("Relationship")].map((item) => item.getAttribute("Id")));
      for (const blip of parse(part).getElementsByTagName("a:blip")) expect(ids, part).toContain(blip.getAttribute("r:embed"));
    }

    const section = parse("word/document.xml").getElementsByTagNameNS(W, "sectPr")[0];
    expect([...section.children].map((child) => child.localName)).toEqual(["headerReference", "footerReference", "pgSz", "pgMar"]);
    for (const run of parse("word/document.xml").getElementsByTagNameNS(W, "rPr")) {
      const order = ["rStyle", "b", "bCs", "i", "iCs", "strike", "sz", "szCs", "u", "vertAlign"];
      const seen = [...run.children].map((child) => order.indexOf(child.localName));
      expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    }
    const inline = parse("word/document.xml").getElementsByTagName("wp:inline")[0];
    expect([...inline.children].map((child) => child.localName)).toEqual(["extent", "docPr", "graphic"]);
    expect(parse("word/footer1.xml").getElementsByTagNameNS(W, "fldSimple")).toHaveLength(2);
  });

  test("survives a round trip through mammoth with its picture", async () => {
    const { html, left_out } = await docx_to_html(await (await build_docx(SAMPLE_V4, "Report")).arrayBuffer());
    expect(left_out).toEqual([]);
    expect(html).toMatch(/<img alt="Logo" src="data:image\/webp;base64,[^"]+"/);
    const editor = new WarrenEditor((error) => {
      throw error;
    });
    editor.load_html(html);
    expect(blocks_of(editor.json).map((block) => block.kind)).toEqual(["heading", "image", "paragraph"]);
    editor.destroy();
  });
});

describe("print layout", () => {
  test("counts the pages and makes room for a tall header", async () => {
    const text = SAMPLE_V4.editor.root.children.filter((node) => node.type !== "image");
    const long = {
      ...SAMPLE_V4,
      header: { root: { ...SAMPLE_V4.header!.root, children: SAMPLE_V4.header!.root.children.filter((node) => node.type !== "image") } },
      editor: { root: { ...SAMPLE_V4.editor.root, children: [...text, { type: "page-break", version: 1 }, ...text] } },
    };
    const layout = await measure_layout(long, "");
    expect(layout).toEqual({ pages: 2, top: 25, bottom: 30 });
    const tall = await measure_layout(SAMPLE_V4, "");
    expect(tall!.top).toBeGreaterThan(12.5 + 50);
    expect(tall!.pages).toBeGreaterThan(2);
    expect(await measure_layout({ ...SAMPLE_V4, header: undefined, footer: undefined }, "")).toBeNull();
  });
});
