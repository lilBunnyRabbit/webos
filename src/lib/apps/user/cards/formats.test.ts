import { describe, expect, test } from "vitest";
import { CardFormat, DETECTOR_FORMATS, encoder_text, FORMAT_IDS, FORMATS, format_from_detected, gtin_check_digit, guess_format, upce_to_upca_body, validate_code } from "./formats";
import { ENCODERS } from "./render";

describe("format table", () => {
  test("every barcode format has a bwip-js encoder, number only has none", () => {
    for (const format of FORMAT_IDS) {
      const { bcid } = FORMATS[format];
      if (format === CardFormat.NONE) expect(bcid).toBeNull();
      else expect(ENCODERS[bcid!], format).toBeTypeOf("function");
    }
  });

  test("the scanner asks for every BarcodeDetector format Cards draws", () => {
    expect([...DETECTOR_FORMATS].sort()).toEqual(
      ["aztec", "codabar", "code_128", "code_39", "code_93", "data_matrix", "ean_13", "ean_8", "itf", "pdf417", "qr_code", "upc_a", "upc_e"].sort()
    );
  });

  test("detected format names map to card formats", () => {
    expect(format_from_detected("ean_13")).toBe(CardFormat.EAN_13);
    expect(format_from_detected("qr_code")).toBe(CardFormat.QR);
    expect(format_from_detected("unknown")).toBeNull();
    expect(format_from_detected("none")).toBeNull();
  });
});

describe("check digits", () => {
  test("GTIN", () => {
    expect(gtin_check_digit("400638133393")).toBe(1);
    expect(gtin_check_digit("9638507")).toBe(4);
    expect(gtin_check_digit("03600029145")).toBe(2);
  });

  test("UPC-E expands to its UPC-A body by its last digit", () => {
    expect(upce_to_upca_body("01234505")).toBe("01200000345");
    expect(upce_to_upca_body("04252614")).toBe("04210000526");
    expect(upce_to_upca_body("01234531")).toBe("01230000045");
    expect(upce_to_upca_body("01234548")).toBe("01234000005");
    expect(upce_to_upca_body("01234558")).toBe("01234500005");
  });
});

describe("validate_code", () => {
  test("empty", () => {
    expect(validate_code(CardFormat.NONE, "")).toBe("Enter the card number");
  });

  test("EAN-13", () => {
    expect(validate_code(CardFormat.EAN_13, "4006381333931")).toBeNull();
    expect(validate_code(CardFormat.EAN_13, "4006381333932")).toBe("The last digit should be 1; check the number");
    expect(validate_code(CardFormat.EAN_13, "400638133393")).toBe("EAN-13 needs 13 digits, this has 12");
    expect(validate_code(CardFormat.EAN_13, "40063813339AB")).toBe("EAN-13 takes digits only");
  });

  test("EAN-8, UPC-A, UPC-E", () => {
    expect(validate_code(CardFormat.EAN_8, "96385074")).toBeNull();
    expect(validate_code(CardFormat.UPC_A, "036000291452")).toBeNull();
    expect(validate_code(CardFormat.UPC_A, "036000291453")).toMatch(/should be 2/);
    expect(validate_code(CardFormat.UPC_E, "04252614")).toBeNull();
    expect(validate_code(CardFormat.UPC_E, "24252614")).toBe("UPC-E starts with 0 or 1");
    expect(validate_code(CardFormat.UPC_E, "04252615")).toMatch(/should be 4/);
  });

  test("ITF, Code 39, Code 93, Codabar, Code 128", () => {
    expect(validate_code(CardFormat.ITF, "1234")).toBeNull();
    expect(validate_code(CardFormat.ITF, "123")).toBe("ITF needs an even number of digits");
    expect(validate_code(CardFormat.CODE_39, "ABC-123")).toBeNull();
    expect(validate_code(CardFormat.CODE_39, "abc")).toMatch(/A–Z/);
    expect(validate_code(CardFormat.CODE_93, "AB 12")).toBeNull();
    expect(validate_code(CardFormat.CODABAR, "A40156B")).toBeNull();
    expect(validate_code(CardFormat.CODABAR, "40156")).toBeNull();
    expect(validate_code(CardFormat.CODABAR, "40X56")).toMatch(/Codabar/);
    expect(validate_code(CardFormat.CODE_128, "Club-42 x")).toBeNull();
    expect(validate_code(CardFormat.CODE_128, "č")).toMatch(/Code 128/);
  });

  test("2D formats and number only take any text", () => {
    for (const format of [CardFormat.QR, CardFormat.AZTEC, CardFormat.DATA_MATRIX, CardFormat.PDF417, CardFormat.NONE]) {
      expect(validate_code(format, "Žiga · 123")).toBeNull();
    }
  });
});

describe("guess_format", () => {
  test("13 digits are EAN-13, a valid 8 digits EAN-8, anything else Code 128", () => {
    expect(guess_format("4006381333931")).toBe(CardFormat.EAN_13);
    expect(guess_format("96385074")).toBe(CardFormat.EAN_8);
    expect(guess_format("96385075")).toBe(CardFormat.CODE_128);
    expect(guess_format("ABC123")).toBe(CardFormat.CODE_128);
    expect(guess_format("")).toBe(CardFormat.CODE_128);
  });
});

test("Codabar gets start and stop characters when they're missing", () => {
  expect(encoder_text(CardFormat.CODABAR, "40156")).toBe("A40156A");
  expect(encoder_text(CardFormat.CODABAR, "B40156C")).toBe("B40156C");
  expect(encoder_text(CardFormat.EAN_13, "4006381333931")).toBe("4006381333931");
});
