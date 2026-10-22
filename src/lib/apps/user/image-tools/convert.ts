import { file_stem } from "$lib/core/api/services/files/path";
import { ENCODER_INFO, EncoderFormat } from "$kit/utils/codecs/formats";

const ICO_SIDE = 256;
const HUGE = 4;

export interface ConvertSource {
  size: number;
  width: number;
  height: number;
  alpha: boolean;
}

export function convert_warnings(format: EncoderFormat, source: ConvertSource, size: number | null): string[] {
  const info = ENCODER_INFO[format];
  const ratio = size === null || source.size === 0 ? 0 : size / source.size;
  return [
    source.alpha && !info.alpha ? "Transparency flattened onto white" : null,
    source.alpha && format === EncoderFormat.GIF ? "Transparency is on or off: soft edges turn hard" : null,
    format === EncoderFormat.GIF ? "Cut to 256 colours" : null,
    format === EncoderFormat.ICO && Math.max(source.width, source.height) > ICO_SIDE ? `Shrunk to ${ICO_SIDE} px at most` : null,
    ratio >= HUGE ? `${Math.round(ratio)}× the original` : null,
  ].filter((line) => line !== null);
}

export function converted_name(name: string, format: EncoderFormat): string {
  return `${file_stem(name)}${ENCODER_INFO[format].extension}`;
}

export function formats_folder_name(name: string): string {
  return `${file_stem(name)}-formats`;
}

export function formats_zip_name(name: string): string {
  return `${formats_folder_name(name)}.zip`;
}
