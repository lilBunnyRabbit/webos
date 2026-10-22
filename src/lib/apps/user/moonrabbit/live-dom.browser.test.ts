import { afterEach, describe, expect, test } from "vitest";
import { media_token } from "./journal";
import { offset_of, place_caret, position_at, read_body, restyle } from "./live-dom";

const A = "a".repeat(32);
let root: HTMLDivElement;

function image_for(id: string): HTMLImageElement {
  const image = document.createElement("img");
  image.dataset.media = id;
  return image;
}

function mount(): HTMLDivElement {
  root = document.createElement("div");
  root.contentEditable = "plaintext-only";
  root.style.whiteSpace = "pre-wrap";
  document.body.append(root);
  return root;
}

afterEach(() => root?.remove());

describe("live formatting in the DOM", () => {
  test("renders styled spans and reads back the exact body", () => {
    const body = `## Day\n- walk **far**\n${media_token(A)}\n*soft* #tag\n`;
    const element = mount();
    expect(restyle(element, body, image_for)).toBe(true);
    expect(read_body(element)).toBe(body);
    expect(element.querySelector(".md-h2")?.textContent).toBe("## Day");
    expect(element.querySelector(".md-bold")?.textContent).toBe("far");
    expect(element.querySelector(".md-italic")?.textContent).toBe("soft");
    expect(element.querySelector(".md-tag")?.textContent).toBe("#tag");
    expect(element.querySelector("img")?.dataset.media).toBe(A);
    expect(restyle(element, body, image_for)).toBe(false);
  });

  test("every caret offset maps to a position and back", () => {
    const body = `# T\n- **b** x\n${media_token(A)}y`;
    const element = mount();
    restyle(element, body, image_for);
    const token = media_token(A).length;
    const image_at = body.indexOf("![");
    for (let offset = 0; offset <= body.length; offset++) {
      const position = position_at(element, offset);
      const inside_token = offset > image_at && offset < image_at + token;
      expect(offset_of(element, position.node, position.offset), `offset ${offset}`).toBe(inside_token ? image_at + token : offset);
    }
  });

  test("keeps the photo element and the caret across a re-render", () => {
    const element = mount();
    restyle(element, `x ${media_token(A)}`, image_for);
    const image = element.querySelector("img");
    restyle(element, `**x** ${media_token(A)}`, image_for);
    expect(element.querySelector("img")).toBe(image);
    element.focus();
    place_caret(element, 3);
    const range = document.getSelection()!.getRangeAt(0);
    expect(offset_of(element, range.startContainer, range.startOffset)).toBe(3);
  });

  test("restyles when typing turns text into a heading", () => {
    const element = mount();
    restyle(element, "Title", image_for);
    expect(restyle(element, "# Title", image_for)).toBe(true);
    expect(element.querySelector(".md-h1")).not.toBeNull();
  });
});
