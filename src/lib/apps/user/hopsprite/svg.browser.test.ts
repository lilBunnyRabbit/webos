import { afterEach, describe, expect, it } from "vitest";
import { animated_svg } from "./svg";

let host: HTMLElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

function mount(markup: string): SVGSVGElement {
  host = document.createElement("div");
  host.innerHTML = markup;
  document.body.append(host);
  return host.querySelector("svg")!;
}

describe("animated svg in the browser", () => {
  it("shows exactly one frame at a time, at the right times", () => {
    const svg = mount(
      animated_svg({
        width: 2,
        height: 1,
        scale: 1,
        bodies: ['<path fill="#ff0000" d="M0 0h1v1h-1z"/>', '<path fill="#0000ff" d="M1 0h1v1h-1z"/>'],
        steps: [
          { frame: 0, duration: 100 },
          { frame: 1, duration: 300 },
        ],
        loop: true,
      })
    );
    const groups = [...svg.querySelectorAll(":scope > g")];
    expect(groups).toHaveLength(2);
    const shown = () => groups.map((group) => getComputedStyle(group).visibility);

    svg.pauseAnimations();
    svg.setCurrentTime(0.05);
    expect(shown()).toEqual(["visible", "hidden"]);
    svg.setCurrentTime(0.25);
    expect(shown()).toEqual(["hidden", "visible"]);
    svg.setCurrentTime(0.45);
    expect(shown()).toEqual(["visible", "hidden"]);
  });

  it("parses as well-formed SVG", () => {
    const text = animated_svg({ width: 1, height: 1, scale: 4, bodies: ["", ""], steps: [{ frame: 0, duration: 1 }, { frame: 1, duration: 1 }], loop: false });
    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.getAttribute("width")).toBe("4");
  });
});
