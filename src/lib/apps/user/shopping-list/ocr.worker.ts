/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/wasm";
import type { Bounds } from "$lib/core/utils/type";
import { box_rows, is_poor, page_lines, page_score, type OcrBox, type OcrPage } from "./lines";
import det_url from "./models/det.onnx?url";
import dictionary from "./models/latin-dict.json";
import rec_url from "./models/latin-rec.onnx?url";
import { ctc_decode, text_boxes } from "./paddle";
import { draw, upright } from "./photo";
import { vocabulary } from "./snap";
import { GROCERY_WORDS } from "./words";

export interface OcrRequest {
  image: Blob;
  crop: Bounds | null;
  history: readonly string[];
}

export type OcrReply =
  | { type: "message"; text: string }
  | { type: "progress"; fraction: number }
  | { type: "done"; lines: string[] }
  | { type: "error"; message: string };

// Without cross-origin isolation there's no SharedArrayBuffer, so wasm threads can't start.
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const DETECT_SIDE = 1280;
const LINE_HEIGHT = 48;
const CHARACTERS = ["", ...dictionary, " "];
/** Phones mostly store a photo a quarter turn off, so those come before upside down. */
const TURNS = [0, 90, 270, 180];

const post = (reply: OcrReply) => self.postMessage(reply);

function pixels(source: OffscreenCanvas, area: Bounds, width: number, height: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, area.x, area.y, area.width, area.height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

/** Planar BGR, as Paddle's models were trained on, normalised per channel. */
function tensor(data: Uint8ClampedArray, width: number, height: number, mean: readonly number[], std: readonly number[]): ort.Tensor {
  const size = width * height;
  const planes = new Float32Array(3 * size);
  for (let index = 0; index < size; index++) {
    for (let channel = 0; channel < 3; channel++) {
      planes[channel * size + index] = (data[index * 4 + (2 - channel)] / 255 - mean[channel]) / std[channel];
    }
  }
  return new ort.Tensor("float32", planes, [1, 3, height, width]);
}

async function detect(session: ort.InferenceSession, source: OffscreenCanvas): Promise<Bounds[]> {
  const ratio = DETECT_SIDE / Math.max(source.width, source.height);
  const width = Math.max(32, Math.round((source.width * ratio) / 32) * 32);
  const height = Math.max(32, Math.round((source.height * ratio) / 32) * 32);
  const whole = { x: 0, y: 0, width: source.width, height: source.height };
  const input = tensor(pixels(source, whole, width, height), width, height, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const map = output[session.outputNames[0]].data as Float32Array;
  const scale_x = source.width / width;
  const scale_y = source.height / height;
  return text_boxes(map, width, height).map((box) => ({ x: box.x * scale_x, y: box.y * scale_y, width: box.width * scale_x, height: box.height * scale_y }));
}

async function recognize(session: ort.InferenceSession, source: OffscreenCanvas, box: Bounds): Promise<OcrBox> {
  const width = Math.min(3200, Math.max(16, Math.ceil((LINE_HEIGHT * box.width) / box.height)));
  const input = tensor(pixels(source, box, width, LINE_HEIGHT), width, LINE_HEIGHT, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const scores = output[session.outputNames[0]];
  const [, steps, classes] = scores.dims;
  const { text, confidence } = ctc_decode(scores.data as Float32Array, steps, classes, CHARACTERS);
  return { ...box, text: text.trim(), confidence: confidence * 100 };
}

async function read({ image, crop, history }: OcrRequest): Promise<string[]> {
  post({ type: "message", text: "Loading the text reader" });
  const [detector, recognizer] = await Promise.all([ort.InferenceSession.create(det_url), ort.InferenceSession.create(rec_url)]);
  const bitmap = await upright(image);
  try {
    let best: OcrPage | null = null;
    for (const [index, turn] of TURNS.entries()) {
      post({ type: "message", text: index === 0 ? "Reading the photo" : `Trying it turned ${turn}°` });
      const source = draw(bitmap, crop, turn);
      const boxes = await detect(detector, source);
      const read: OcrBox[] = [];
      for (const box of boxes) {
        read.push(await recognize(recognizer, source, box));
        post({ type: "progress", fraction: (index + read.length / boxes.length) / TURNS.length });
      }
      const page = box_rows(read.filter((box) => box.text));
      if (!best || page_score(page) > page_score(best)) best = page;
      if (!is_poor(page)) break;
    }
    return page_lines(best!, vocabulary(history, GROCERY_WORDS));
  } finally {
    bitmap.close();
  }
}

self.onmessage = (event: MessageEvent<OcrRequest>) => {
  read(event.data).then(
    (lines) => post({ type: "done", lines }),
    (error: unknown) => post({ type: "error", message: error instanceof Error ? error.message : String(error) })
  );
};
