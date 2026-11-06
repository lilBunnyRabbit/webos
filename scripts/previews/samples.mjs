import { createRequire } from "node:module";

const require = createRequire(new URL("../../src/lib/apps/user/pdf-tools/package.json", import.meta.url));
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

export const PALETTES = {
  dusk: {
    sky: ["#f6c58f", "#e98a6b", "#7d5a86"],
    sun: "#ffe7b0",
    hills: ["#8a6a8f", "#5e4a72", "#3a2f52"],
    water: "#6d5a80",
  },
  meadow: {
    sky: ["#cfe6f2", "#9fc8e0", "#6fa3c8"],
    sun: "#fff6d8",
    hills: ["#93b86b", "#5f8f4a", "#3d6338"],
    water: "#5d8fb0",
  },
  coast: {
    sky: ["#fde9c9", "#f3c7a0", "#9cb7c9"],
    sun: "#fff3d6",
    hills: ["#b9a58c", "#7f8f8a", "#4f6670"],
    water: "#5f8ea3",
  },
};

export async function paint_landscape({ palette, width, height, seed, frame = null }) {
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext("2d");
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const t = frame ?? 0;
  const horizon = height * 0.62;
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  palette.sky.forEach((colour, i) => sky.addColorStop(i / (palette.sky.length - 1), colour));
  g.fillStyle = sky;
  g.fillRect(0, 0, width, horizon);
  const sun_x = width * (0.68 - t * 0.08);
  const sun_y = horizon * (0.55 + t * 0.25);
  const glow = g.createRadialGradient(sun_x, sun_y, 0, sun_x, sun_y, width * 0.3);
  glow.addColorStop(0, `${palette.sun}cc`);
  glow.addColorStop(1, `${palette.sun}00`);
  g.fillStyle = glow;
  g.fillRect(0, 0, width, horizon);
  g.fillStyle = palette.sun;
  g.beginPath();
  g.arc(sun_x, sun_y, width * 0.045, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff55";
  for (let c = 0; c < 5; c++) {
    const cx = ((random() * width + t * width * (0.15 + c * 0.03)) % (width * 1.2)) - width * 0.1;
    const cy = horizon * (0.15 + random() * 0.35);
    for (let p = 0; p < 6; p++) {
      g.beginPath();
      g.ellipse(cx + p * width * 0.025, cy + Math.sin(p) * 6, width * 0.05, height * 0.025, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  palette.hills.forEach((colour, layer) => {
    const phase = random() * 10;
    const base = horizon - height * (0.18 - layer * 0.06);
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(0, horizon);
    for (let x = 0; x <= width; x += 4) {
      const u = x / width;
      const y =
        base -
        Math.sin(u * 5 + phase) * height * 0.05 -
        Math.sin(u * 13 + phase * 2) * height * 0.02 -
        Math.sin(u * 31 + phase) * height * 0.006;
      g.lineTo(x, y);
    }
    g.lineTo(width, horizon);
    g.closePath();
    g.fill();
  });
  const top = g.getImageData(0, horizon - (height - horizon), width, height - horizon);
  const flipped = new OffscreenCanvas(width, height - horizon);
  const f = flipped.getContext("2d");
  f.putImageData(top, 0, 0);
  g.save();
  g.translate(0, height);
  g.scale(1, -1);
  g.globalAlpha = 0.55;
  g.drawImage(flipped, 0, 0);
  g.restore();
  g.fillStyle = `${palette.water}88`;
  g.fillRect(0, horizon, width, height - horizon);
  g.strokeStyle = "#ffffff30";
  for (let i = 0; i < 90; i++) {
    const y = horizon + random() * (height - horizon);
    const x = random() * width + Math.sin(t * 6 + i) * 12;
    g.lineWidth = 1 + random() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 20 + random() * 60, y);
    g.stroke();
  }
  return canvas;
}

async function to_base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export async function photo(page, palette, seed, width = 1600, height = 1066) {
  return page.evaluate(
    async ({ paint, encode, args }) => {
      const paint_landscape = new Function(`return ${paint}`)();
      const to_base64 = new Function(`return ${encode}`)();
      const canvas = await paint_landscape(args);
      return to_base64(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 }));
    },
    {
      paint: paint_landscape.toString(),
      encode: to_base64.toString(),
      args: { palette: PALETTES[palette], width, height, seed },
    }
  );
}

export async function video(page, base, seconds = 6) {
  return page.evaluate(
    async ({ paint, encode, encoder_url, palette, seconds }) => {
      const paint_landscape = new Function(`return ${paint}`)();
      const to_base64 = new Function(`return ${encode}`)();
      const { WebmEncoder } = await import(encoder_url);
      const width = 960;
      const height = 540;
      const fps = 30;
      const encoder = await WebmEncoder.create({ video: { width, height, bitrate: 2_000_000, framerate: fps } });
      const count = seconds * fps;
      for (let i = 0; i < count; i++) {
        const canvas = await paint_landscape({ palette, width, height, seed: 7, frame: i / count });
        encoder.encode_frame(canvas, Math.round((i / fps) * 1e6));
        await encoder.drained();
      }
      return to_base64(await encoder.finish(seconds * 1000));
    },
    {
      paint: paint_landscape.toString(),
      encode: to_base64.toString(),
      encoder_url: new URL("src/lib/kit/utils/video/encode.ts", base).href,
      palette: PALETTES.coast,
      seconds,
    }
  );
}

const TRIP = [
  ["Lisbon, four days", "A slow city break: trams, tiles, custard tarts and the river at sunset."],
  [
    "Day one: Alfama",
    "Walk up from Baixa to the castle early, before the tour groups. Lunch at the tiny tasca by the church, then the viewpoint at Santa Luzia.",
  ],
  [
    "Day two: Belém",
    "Tram 15 to the monastery and the tower. The pastry shop opens at eight; the queue moves fast. Back along the river by bike.",
  ],
  [
    "Day three: Sintra",
    "Train from Rossio, 40 minutes. Pena Palace first, then the Moorish castle walls. Pack a jumper: it is always colder up there.",
  ],
  [
    "Day four: markets",
    "Time Out market for breakfast, LX Factory for books and coffee, last swim at Carcavelos if the weather holds.",
  ],
  [
    "Where to eat",
    "Tascas over restaurants. Grilled sardines in summer, bifana any time, and a ginjinha in a chocolate cup after dinner.",
  ],
  [
    "Getting around",
    "A Viva Viagem card covers trams, metro, ferries and trains. Walk the hills down, take the funiculars up.",
  ],
  ["Packing list", "Good shoes for the cobbles, a light rain jacket, sunscreen, a tote for the market and an adaptor."],
  ["Budget", "About 90 euros a day for two, without the flat. Museums are free on Sunday mornings for residents only."],
  ["Phrases", "Bom dia, obrigado or obrigada, a conta por favor, and um café, which gets you an espresso."],
];

export async function pdf() {
  const document = await PDFDocument.create();
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const accent = [
    rgb(0.47, 0.29, 0.2),
    rgb(0.29, 0.45, 0.55),
    rgb(0.42, 0.53, 0.33),
    rgb(0.62, 0.42, 0.25),
    rgb(0.5, 0.35, 0.5),
  ];
  TRIP.forEach(([title, text], index) => {
    const page = document.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: accent[index] });
    page.drawText(title, { x: 48, y: 780, size: 28, font: bold, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 48, y: 470, width: 499, height: 230, color: accent[index], opacity: 0.18 });
    page.drawCircle({ x: 420, y: 620, size: 34, color: accent[index], opacity: 0.45 });
    page.drawRectangle({ x: 48, y: 470, width: 499, height: 70, color: accent[index], opacity: 0.3 });
    const words = text.split(" ");
    let line = "";
    let y = 430;
    for (const word of words) {
      if (regular.widthOfTextAtSize(`${line} ${word}`, 13) > 499) {
        page.drawText(line, { x: 48, y, size: 13, font: regular, color: rgb(0.2, 0.2, 0.22) });
        y -= 20;
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    page.drawText(line, { x: 48, y, size: 13, font: regular, color: rgb(0.2, 0.2, 0.22) });
    for (let row = 0; row < 7; row++)
      page.drawRectangle({
        x: 48,
        y: y - 50 - row * 22,
        width: 499 - (row % 3) * 90,
        height: 8,
        color: rgb(0.86, 0.85, 0.83),
      });
    page.drawText(`${index + 1} / ${TRIP.length}`, {
      x: 520,
      y: 40,
      size: 10,
      font: regular,
      color: rgb(0.5, 0.5, 0.5),
    });
  });
  return Buffer.from(await document.save()).toString("base64");
}
