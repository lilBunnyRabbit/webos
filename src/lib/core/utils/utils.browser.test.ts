import { afterEach, describe, expect, test } from "vitest";
import { resolve_token } from "./utils";

let host: HTMLElement | null = null;

afterEach(() => host?.remove());

describe("resolve_token", () => {
  test("resolves var() and color-mix() to a colour the canvas parses, and leaves the probe clean", () => {
    host = document.createElement("div");
    host.style.setProperty("--brand", "rgb(255, 0, 0)");
    const probe = document.createElement("span");
    host.append(probe);
    document.body.append(host);

    expect(resolve_token(probe, "var(--brand)")).toBe("rgb(255, 0, 0)");
    expect(resolve_token(probe, "color-mix(in srgb, var(--brand) 50%, transparent)")).toMatch(/^(rgba|color)\(/);
    expect(probe.style.color).toBe("");
  });
});
