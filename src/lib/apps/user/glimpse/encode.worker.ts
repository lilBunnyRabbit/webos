import { serve } from "$kit/utils/worker/serve";
import type { Turn } from "./orientation";

export interface Encoded {
  photo: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export interface EncodeApi {
  encode(input: { frame: ImageBitmap; turn: Turn }): Encoded;
}

const QUALITY = 0.85;
const THUMB_SIDE = 320;

function draw(frame: ImageBitmap, turn: Turn, scale: number): OffscreenCanvas {
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const sideways = turn % 2 === 1;
  const canvas = new OffscreenCanvas(sideways ? height : width, sideways ? width : height);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turn * Math.PI) / 2);
  context.drawImage(frame, -width / 2, -height / 2, width, height);
  return canvas;
}

async function encode({ frame, turn }: { frame: ImageBitmap; turn: Turn }): Promise<Encoded> {
  try {
    const full = draw(frame, turn, 1);
    const photo = await full.convertToBlob({ type: "image/jpeg", quality: QUALITY });
    const small = draw(frame, turn, Math.min(1, THUMB_SIDE / Math.max(frame.width, frame.height)));
    const thumb = await small.convertToBlob({ type: "image/jpeg", quality: QUALITY });
    return { photo, thumb, width: full.width, height: full.height };
  } finally {
    frame.close();
  }
}

serve<EncodeApi>({ encode });
