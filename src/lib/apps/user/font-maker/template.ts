import { CHAR_SET_LABELS, set_characters, type CharSet } from "./charsets";
import { BOX, BOX_HEIGHT, BOX_WIDTH, type Metrics } from "./model";
import type { Vec } from "./outline";

export const PAGE = { width: 210, height: 297 };
export const MARK_SIZE = 8;
export const MARK_INSET = 10;
export const COLUMNS = 10;
const BOX_MM = 16.4;
const BOX_MM_HEIGHT = (BOX_MM * BOX_HEIGHT) / BOX_WIDTH;
const LABEL_MM = 3.6;
const ROW_GAP = 1.2;
const GRID_TOP = 26;

export interface TemplateBox {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateLayout {
  set: CharSet;
  marks: [Vec, Vec, Vec, Vec];
  boxes: TemplateBox[];
}

export function template_layout(set: CharSet): TemplateLayout {
  const left = (PAGE.width - COLUMNS * BOX_MM) / 2;
  const half = MARK_INSET + MARK_SIZE / 2;
  const boxes = set_characters(set).map((char, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      char,
      x: left + column * BOX_MM,
      y: GRID_TOP + LABEL_MM + row * (BOX_MM_HEIGHT + LABEL_MM + ROW_GAP),
      width: BOX_MM,
      height: BOX_MM_HEIGHT,
    };
  });
  return {
    set,
    marks: [
      { x: half, y: half },
      { x: PAGE.width - half, y: half },
      { x: PAGE.width - half, y: PAGE.height - half },
      { x: half, y: PAGE.height - half },
    ],
    boxes,
  };
}

export function guide_lines(metrics: Metrics): { y: number; strong: boolean }[] {
  return [
    { y: 0, strong: true },
    { y: metrics.x, strong: false },
    { y: metrics.cap, strong: false },
    { y: -metrics.descender, strong: false },
  ];
}

const box_y = (box: TemplateBox, font_y: number) => box.y + ((BOX.top - font_y) / BOX_HEIGHT) * box.height;

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

// The top-left mark has a hole so a sideways or upside-down photo still reads in order.
const HOLE = MARK_SIZE / 3;

export function template_html(layout: TemplateLayout, metrics: Metrics, title: string): string {
  const mm = (value: number) => `${value.toFixed(2)}mm`;
  const marks = layout.marks
    .map((mark, index) => {
      const square = `<div class="mark" style="left:${mm(mark.x - MARK_SIZE / 2)};top:${mm(mark.y - MARK_SIZE / 2)}"></div>`;
      const hole = index === 0 ? `<div class="hole" style="left:${mm(mark.x - HOLE / 2)};top:${mm(mark.y - HOLE / 2)}"></div>` : "";
      return square + hole;
    })
    .join("");
  const lines = guide_lines(metrics);
  const boxes = layout.boxes
    .map((box) => {
      const guides = lines
        .map((line) => `<div class="${line.strong ? "base" : "guide"}" style="top:${mm(box_y(box, line.y) - box.y)}"></div>`)
        .join("");
      return (
        `<div class="label" style="left:${mm(box.x)};top:${mm(box.y - LABEL_MM)};width:${mm(box.width)}">${escape(box.char)}</div>` +
        `<div class="box" style="left:${mm(box.x)};top:${mm(box.y)};width:${mm(box.width)};height:${mm(box.height)}">${guides}</div>`
      );
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
@page { size: A4; margin: 0; }
html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { margin: 0; width: 210mm; height: 297mm; position: relative; background: #fff; color: #111; font: 9pt system-ui, sans-serif; }
div { position: absolute; box-sizing: border-box; }
.mark { width: ${MARK_SIZE}mm; height: ${MARK_SIZE}mm; background: #000; }
.hole { width: ${mm(HOLE)}; height: ${mm(HOLE)}; background: #fff; }
.title { left: 22mm; right: 22mm; top: 11mm; text-align: center; font-weight: 600; }
.hint { left: 22mm; right: 22mm; top: 16mm; text-align: center; font-size: 7pt; color: #777; }
.label { height: ${LABEL_MM}mm; text-align: center; font-size: 7pt; line-height: ${LABEL_MM}mm; color: #888; }
.box { border: 0.2mm solid #bbb; }
.guide, .base { left: 0; right: 0; height: 0; border-top: 0.15mm dashed #d4d4d4; }
.base { border-top: 0.2mm solid #c4c4c4; }
</style></head><body>
<div class="title">${escape(title)} · ${escape(CHAR_SET_LABELS[layout.set])}</div>
<div class="hint">Write one character per box in dark ink, sitting on the solid line. Keep all four black squares in the photo.</div>
${marks}${boxes}
</body></html>`;
}

export const PNG_DPI = 150;

export function draw_template(context: OffscreenCanvasRenderingContext2D, layout: TemplateLayout, metrics: Metrics, title: string): void {
  const scale = PNG_DPI / 25.4;
  const px = (value: number) => value * scale;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, px(PAGE.width), px(PAGE.height));
  context.fillStyle = "#000";
  layout.marks.forEach((mark, index) => {
    context.fillStyle = "#000";
    context.fillRect(px(mark.x - MARK_SIZE / 2), px(mark.y - MARK_SIZE / 2), px(MARK_SIZE), px(MARK_SIZE));
    if (index === 0) {
      context.fillStyle = "#fff";
      context.fillRect(px(mark.x - HOLE / 2), px(mark.y - HOLE / 2), px(HOLE), px(HOLE));
    }
  });
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#111";
  context.font = `600 ${px(3.2)}px system-ui, sans-serif`;
  context.fillText(`${title} · ${CHAR_SET_LABELS[layout.set]}`, px(PAGE.width / 2), px(13));
  context.fillStyle = "#777";
  context.font = `${px(2.5)}px system-ui, sans-serif`;
  context.fillText("Write one character per box in dark ink, sitting on the solid line. Keep all four black squares in the photo.", px(PAGE.width / 2), px(18));
  const lines = guide_lines(metrics);
  for (const box of layout.boxes) {
    context.fillStyle = "#888";
    context.font = `${px(2.5)}px system-ui, sans-serif`;
    context.fillText(box.char, px(box.x + box.width / 2), px(box.y - LABEL_MM / 2));
    context.strokeStyle = "#bbb";
    context.lineWidth = px(0.2);
    context.setLineDash([]);
    context.strokeRect(px(box.x), px(box.y), px(box.width), px(box.height));
    for (const line of lines) {
      context.strokeStyle = line.strong ? "#c4c4c4" : "#d4d4d4";
      context.setLineDash(line.strong ? [] : [px(0.6), px(0.6)]);
      context.beginPath();
      context.moveTo(px(box.x), px(box_y(box, line.y)));
      context.lineTo(px(box.x + box.width), px(box_y(box, line.y)));
      context.stroke();
    }
  }
}
