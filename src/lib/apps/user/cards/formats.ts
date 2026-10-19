// Barcode formats use BarcodeDetector's names, so a scan maps onto them one to one.
export const CardFormat = {
  EAN_13: "ean_13",
  EAN_8: "ean_8",
  UPC_A: "upc_a",
  UPC_E: "upc_e",
  CODE_128: "code_128",
  CODE_39: "code_39",
  CODE_93: "code_93",
  ITF: "itf",
  CODABAR: "codabar",
  QR: "qr_code",
  PDF417: "pdf417",
  AZTEC: "aztec",
  DATA_MATRIX: "data_matrix",
  NONE: "none",
} as const;
export type CardFormat = (typeof CardFormat)[keyof typeof CardFormat];

export type FormatShape = "linear" | "square" | "stacked" | "none";

export interface FormatInfo {
  label: string;
  bcid: string | null;
  shape: FormatShape;
}

export const FORMATS: Record<CardFormat, FormatInfo> = {
  [CardFormat.EAN_13]: { label: "EAN-13", bcid: "ean13", shape: "linear" },
  [CardFormat.EAN_8]: { label: "EAN-8", bcid: "ean8", shape: "linear" },
  [CardFormat.UPC_A]: { label: "UPC-A", bcid: "upca", shape: "linear" },
  [CardFormat.UPC_E]: { label: "UPC-E", bcid: "upce", shape: "linear" },
  [CardFormat.CODE_128]: { label: "Code 128", bcid: "code128", shape: "linear" },
  [CardFormat.CODE_39]: { label: "Code 39", bcid: "code39", shape: "linear" },
  [CardFormat.CODE_93]: { label: "Code 93", bcid: "code93", shape: "linear" },
  [CardFormat.ITF]: { label: "ITF", bcid: "interleaved2of5", shape: "linear" },
  [CardFormat.CODABAR]: { label: "Codabar", bcid: "rationalizedCodabar", shape: "linear" },
  [CardFormat.QR]: { label: "QR code", bcid: "qrcode", shape: "square" },
  [CardFormat.PDF417]: { label: "PDF417", bcid: "pdf417", shape: "stacked" },
  [CardFormat.AZTEC]: { label: "Aztec", bcid: "azteccode", shape: "square" },
  [CardFormat.DATA_MATRIX]: { label: "Data Matrix", bcid: "datamatrix", shape: "square" },
  [CardFormat.NONE]: { label: "Number only", bcid: null, shape: "none" },
};

export const FORMAT_IDS = Object.values(CardFormat) as [CardFormat, ...CardFormat[]];

export const DETECTOR_FORMATS: string[] = FORMAT_IDS.filter((format) => FORMATS[format].bcid !== null);

export const FORMAT_OPTIONS = FORMAT_IDS.map((value) => ({ value, label: FORMATS[value].label }));

export function format_from_detected(name: string): CardFormat | null {
  return DETECTOR_FORMATS.includes(name) ? (name as CardFormat) : null;
}

export function gtin_check_digit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function upce_to_upca_body(code: string): string {
  const [system, a, b, c, d, e, last] = code.slice(0, 7);
  if (last <= "2") return `${system}${a}${b}${last}0000${c}${d}${e}`;
  if (last === "3") return `${system}${a}${b}${c}00000${d}${e}`;
  if (last === "4") return `${system}${a}${b}${c}${d}00000${e}`;
  return `${system}${a}${b}${c}${d}${e}0000${last}`;
}

const CODE39_CHARS = /^[0-9A-Z \-.$/+%]+$/;
const CODABAR = /^([A-D])?[0-9\-$:/.+]+([A-D])?$/i;
const ASCII = /^[\x20-\x7e]+$/;

function check_gtin(code: string, label: string, length: number): string | null {
  if (!/^\d+$/.test(code)) return `${label} takes digits only`;
  if (code.length !== length) return `${label} needs ${length} digits, this has ${code.length}`;
  const expected = gtin_check_digit(code.slice(0, -1));
  return Number(code.at(-1)) === expected ? null : `The last digit should be ${expected}; check the number`;
}

export function validate_code(format: CardFormat, code: string): string | null {
  if (code.length === 0) return "Enter the card number";
  switch (format) {
    case CardFormat.EAN_13:
      return check_gtin(code, "EAN-13", 13);
    case CardFormat.EAN_8:
      return check_gtin(code, "EAN-8", 8);
    case CardFormat.UPC_A:
      return check_gtin(code, "UPC-A", 12);
    case CardFormat.UPC_E: {
      if (!/^\d+$/.test(code)) return "UPC-E takes digits only";
      if (code.length !== 8) return `UPC-E needs 8 digits, this has ${code.length}`;
      if (code[0] !== "0" && code[0] !== "1") return "UPC-E starts with 0 or 1";
      const expected = gtin_check_digit(upce_to_upca_body(code));
      return Number(code[7]) === expected ? null : `The last digit should be ${expected}; check the number`;
    }
    case CardFormat.ITF:
      if (!/^\d+$/.test(code)) return "ITF takes digits only";
      return code.length % 2 === 0 ? null : "ITF needs an even number of digits";
    case CardFormat.CODE_39:
    case CardFormat.CODE_93:
      return CODE39_CHARS.test(code) ? null : `${FORMATS[format].label} takes A–Z, 0–9, space and - . $ / + %`;
    case CardFormat.CODABAR:
      return CODABAR.test(code) ? null : "Codabar takes digits and - $ : / . +, with optional A–D at both ends";
    case CardFormat.CODE_128:
      return ASCII.test(code) ? null : "Code 128 takes letters, digits and common symbols only";
    default:
      return null;
  }
}

export function guess_format(code: string): CardFormat {
  if (/^\d{13}$/.test(code)) return CardFormat.EAN_13;
  if (/^\d{8}$/.test(code) && check_gtin(code, "EAN-8", 8) === null) return CardFormat.EAN_8;
  return CardFormat.CODE_128;
}

// bwip-js needs Codabar's start and stop characters; some scanners drop them.
export function encoder_text(format: CardFormat, code: string): string {
  if (format === CardFormat.CODABAR && !/^[A-D].*[A-D]$/i.test(code)) return `A${code}A`;
  return code;
}
