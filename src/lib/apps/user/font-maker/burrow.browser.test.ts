import { expect, test } from "vitest";
import { sample_files } from "$lib/core/api/services/version/samples";
import { build_family, build_variable } from "./build";
import { parse_project } from "./format";
import family_url from "../../../../assets/fonts/burrow/burrow.ttc?url";
import italic_url from "../../../../assets/fonts/burrow/burrow-italic-vf.ttf?url";
import upright_url from "../../../../assets/fonts/burrow/burrow-vf.ttf?url";

// The shipped files were built with this date in `head`, so a rebuild matches them byte for byte.
const BUILT = new Date("2026-10-21T00:00:00Z");

async function shipped(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

test("the shipped Burrow fonts are what Font Maker builds from the Burrow sample", async () => {
  const project = parse_project(sample_files().find((file) => file.name === "Burrow.fontmaker")!.content);
  expect(same(build_family(project, BUILT), await shipped(family_url))).toBe(true);
  expect(same(build_variable(project, false, BUILT), await shipped(upright_url))).toBe(true);
  expect(same(build_variable(project, true, BUILT), await shipped(italic_url))).toBe(true);
});
