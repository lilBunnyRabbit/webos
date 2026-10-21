import type { FilesService } from "../files/type";
import { PATHS } from "../files/hierarchy";
import { apps_for } from "../apps/associations";
import type { AppManifest } from "../apps/type";
import BURROW from "./samples/Burrow.fontmaker?raw";

export const SAMPLES_FOLDER = "Samples";

export interface SampleFile {
  name: string;
  content: string;
}

function welcome(lines: string[]): string {
  return `# Welcome to WebOS

These are sample files. Open them, change them, delete them: they're yours.

${lines.map((line) => `- ${line}`).join("\n")}

Right-click any file for Open with, Rename, Compress or Save to disk.

New here? **Getting started** on the desktop shows the rest: the command palette, the Terminal, widgets and backups.
`;
}

const FRUIT = `name,colour,price_eur,in_season
Apple,red,0.40,yes
Banana,yellow,0.25,yes
Cherry,red,4.90,no
Kiwi,green,0.35,yes
Mango,orange,1.80,no
Pear,green,0.45,yes
Plum,purple,3.20,no
`;

const SUNSET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b1e4a"/>
      <stop offset="0.55" stop-color="#e2725b"/>
      <stop offset="1" stop-color="#f6c177"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#sky)"/>
  <circle cx="320" cy="270" r="70" fill="#ffe3a3"/>
  <path d="M0 300 Q160 230 320 290 T640 270 V400 H0 Z" fill="#3b2f4f"/>
  <path d="M0 340 Q200 290 400 335 T640 320 V400 H0 Z" fill="#231b33"/>
</svg>
`;

const BALL_SIZE = 16;
const BALL_RADIUS = 3.5;
/** Ball centre per frame: falls, squashes on the floor, rises. */
const BALL_FRAMES = [3.5, 6.5, 9.5, 11.5, 9.5, 6.5];

function ball_pixels(centre_y: number): number[] {
  const pixels = new Array<number>(BALL_SIZE * BALL_SIZE).fill(0);
  const centre_x = BALL_SIZE / 2 - 0.5;
  for (let y = 0; y < BALL_SIZE; y++) {
    for (let x = 0; x < BALL_SIZE; x++) {
      const dx = x - centre_x;
      const dy = y - centre_y;
      if (dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS) pixels[y * BALL_SIZE + x] = dx < -1 && dy < -1 ? 2 : 1;
      else if (y === BALL_SIZE - 1 && Math.abs(dx) <= 3 + centre_y / 6) pixels[y * BALL_SIZE + x] = 3;
    }
  }
  return pixels;
}

/** A cel trimmed to its pixels' bounding box, as `[count, index]` runs (ADR-039). */
function cel(frame: number, pixels: number[]) {
  const filled = pixels.flatMap((index, i) => (index ? [[i % BALL_SIZE, Math.floor(i / BALL_SIZE)]] : []));
  const xs = filled.map(([x]) => x);
  const ys = filled.map(([, y]) => y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x + 1, Math.max(...ys) - y + 1];
  const rle: [number, number][] = [];
  for (let row = y; row < y + h; row++) {
    for (let column = x; column < x + w; column++) {
      const index = pixels[row * BALL_SIZE + column];
      const last = rle.at(-1);
      if (last && last[1] === index) last[0]++;
      else rle.push([1, index]);
    }
  }
  return { layer: 0, frame, x, y, w, h, rle };
}

function bouncing_ball(): string {
  return JSON.stringify({
    format: "hopsprite",
    version: 1,
    width: BALL_SIZE,
    height: BALL_SIZE,
    palette: ["#00000000", "#e43b44ff", "#ffffffff", "#262b44ff"],
    layers: [{ name: "Ball", visible: true, locked: false, opacity: 1 }],
    frames: BALL_FRAMES.map(() => ({ duration: 90 })),
    tags: [{ name: "bounce", from: 0, to: BALL_FRAMES.length - 1, direction: "forward" }],
    cels: BALL_FRAMES.map((centre, frame) => cel(frame, ball_pixels(centre))),
  });
}

interface Sample extends SampleFile {
  /** What the browser reports for it, for matching MIME associations. */
  type: string;
  /** Its line in Welcome.md. */
  line: string;
}

function samples(): Sample[] {
  return [
    {
      name: "Bouncing ball.hopsprite",
      content: bouncing_ball(),
      type: "",
      line: "**Bouncing ball.hopsprite** opens in Hopsprite, the pixel art editor. Opening it installs the app.",
    },
    { name: "Fruit.csv", content: FRUIT, type: "text/csv", line: "**Fruit.csv** opens as a table you can sort." },
    { name: "Sunset.svg", content: SUNSET, type: "image/svg+xml", line: "**Sunset.svg** opens in Media Preview." },
    {
      name: "Burrow.fontmaker",
      content: BURROW,
      type: "",
      line: "**Burrow.fontmaker** opens in Font Maker. It's Burrow, WebOS's own font, drawn as strokes: change a letter and use it as the app font.",
    },
  ];
}

/**
 * What a first boot puts in `/home/Documents/Samples` (ADR-041): one file per kind of app. Given the registered apps, only
 * files one of them opens, so a fork without the user apps gets no file nothing can open.
 */
export function sample_files(apps?: Iterable<AppManifest>): SampleFile[] {
  const registered = apps && [...apps];
  const kept = samples().filter((sample) => !registered || apps_for(registered, sample).length > 0);
  return [{ name: "Welcome.md", content: welcome(kept.map(({ line }) => line)) }, ...kept.map(({ name, content }) => ({ name, content }))];
}

export async function seed_samples(files: FilesService, apps: Iterable<AppManifest>): Promise<void> {
  const documents = await files.get_directory(PATHS.documents);
  if (!documents) return;
  const folder = await files.create_directory(documents, SAMPLES_FOLDER);
  for (const { name, content } of sample_files(apps)) await files.create_file(folder, name, { content });
}
