import { afterEach, beforeEach, expect, test } from "vitest";
import { insert_image, read_runs, render_runs, toggle_display } from "./editor-dom";
import { parse_content, serialize_content } from "./format";
import { MAX_SIDE, picture_data_url } from "./image";
import { ImageDisplay, type Content } from "./model";

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
  root.contentEditable = "plaintext-only";
  root.style.whiteSpace = "pre-wrap";
  document.body.append(root);
});

afterEach(() => root.remove());

async function sample_picture(width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3a6";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#c33";
  context.fillRect(0, 0, width / 2, height / 2);
  return canvas.convertToBlob({ type: "image/png" });
}

async function size_of(url: string): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
}

test("runs render to the DOM and read back the same", async () => {
  const image = await picture_data_url(await sample_picture(40, 20));
  const content: Content = [
    { text: "The cursor is boring " },
    { image, display: ImageDisplay.INLINE },
    { text: " and static.\n\nNext" },
    { image, display: ImageDisplay.BLOCK },
    { text: "\nafter" },
  ];
  render_runs(root, content);
  expect(root.querySelectorAll("img")).toHaveLength(2);
  expect(read_runs(root)).toEqual(content);
});

test("Chrome's line wrappers and <br> read as line breaks", () => {
  root.innerHTML = "first<div>second</div><div><br></div><div>fourth</div><br>";
  expect(read_runs(root)).toEqual([{ text: "first\nsecond\n\nfourth" }]);
});

test("typing goes through the editor and reads back as text", () => {
  root.focus();
  document.execCommand("insertText", false, "hello");
  document.execCommand("insertText", false, " world");
  expect(read_runs(root)).toEqual([{ text: "hello world" }]);
});

test("an image goes in at the caret, toggles to block and back, and leaves the caret after it", async () => {
  const image = await picture_data_url(await sample_picture(10, 10));
  render_runs(root, [{ text: "ab" }]);
  root.focus();
  const range = document.createRange();
  range.setStart(root.firstChild!, 1);
  range.collapse(true);
  const element = insert_image(root, range, image, ImageDisplay.INLINE);
  expect(read_runs(root)).toEqual([{ text: "a" }, { image, display: ImageDisplay.INLINE }, { text: "b" }]);

  document.execCommand("insertText", false, "X");
  expect(read_runs(root)).toEqual([{ text: "a" }, { image, display: ImageDisplay.INLINE }, { text: "Xb" }]);

  toggle_display(element);
  expect(read_runs(root)[1]).toEqual({ image, display: ImageDisplay.BLOCK });
  toggle_display(element);
  expect(read_runs(root)[1]).toEqual({ image, display: ImageDisplay.INLINE });
});

test("an image with no caret in the editor goes at the end", async () => {
  const image = await picture_data_url(await sample_picture(10, 10));
  render_runs(root, [{ text: "end" }]);
  insert_image(root, null, image, ImageDisplay.BLOCK);
  expect(read_runs(root)).toEqual([{ text: "end" }, { image, display: ImageDisplay.BLOCK }]);
});

test("pictures are downscaled to 1200 px WebP and survive the file and the editor", async () => {
  const wide = await picture_data_url(await sample_picture(3000, 1500));
  expect(wide.startsWith("data:image/webp;base64,")).toBe(true);
  expect(await size_of(wide)).toEqual({ width: MAX_SIDE, height: 600 });

  const small = await picture_data_url(await sample_picture(200, 400));
  expect(await size_of(small)).toEqual({ width: 200, height: 400 });

  const content: Content = [{ text: "see " }, { image: small, display: ImageDisplay.INLINE }, { image: wide, display: ImageDisplay.BLOCK }];
  const reread = parse_content(serialize_content(content).split("\n"));
  expect(reread).toEqual(content);
  render_runs(root, reread);
  expect(read_runs(root)).toEqual(content);
  await Promise.all([...root.querySelectorAll("img")].map((element) => element.decode()));
  expect(await size_of(read_runs(root).flatMap((run) => ("image" in run ? [run.image] : []))[1])).toEqual({ width: MAX_SIDE, height: 600 });
});

test("a file that isn't a picture is refused", async () => {
  await expect(picture_data_url(new Blob(["nope"], { type: "text/plain" }))).rejects.toThrow(/couldn't be read/);
});
