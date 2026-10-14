import { describe, expect, test } from "vitest";
import {
  base_name,
  describe_pages,
  images_pdf_name,
  join_path,
  merged_name,
  page_image_name,
  parent_path,
  part_name,
  signature_file_name,
  signed_name,
  stem,
} from "./naming";

describe("naming", () => {
  test("paths", () => {
    expect(base_name("/home/a/b.pdf")).toBe("b.pdf");
    expect(parent_path("/home/a/b.pdf")).toBe("/home/a");
    expect(parent_path("/b.pdf")).toBe("/");
    expect(join_path("/", "x.pdf")).toBe("/x.pdf");
    expect(join_path("/home", "x.pdf")).toBe("/home/x.pdf");
  });

  test("stem keeps inner dots and dotfiles", () => {
    expect(stem("report.final.pdf")).toBe("report.final");
    expect(stem(".hidden")).toBe(".hidden");
    expect(stem("plain")).toBe("plain");
  });

  test("output names", () => {
    expect(signed_name("Contract.pdf")).toBe("Contract (signed).pdf");
    expect(merged_name(["a.pdf", "b.pdf"])).toBe("a (merged).pdf");
    expect(merged_name([])).toBe("Merged.pdf");
    expect(images_pdf_name(["cat.png"])).toBe("cat.pdf");
    expect(images_pdf_name(["cat.png", "dog.jpg", "x.webp"])).toBe("cat and 2 more.pdf");
  });

  test("describe_pages collapses runs", () => {
    expect(describe_pages([1, 2, 3])).toBe("1-3");
    expect(describe_pages([5])).toBe("5");
    expect(describe_pages([1, 2, 4, 6, 7])).toBe("1-2, 4, 6-7");
    expect(describe_pages([])).toBe("");
  });

  test("part and page image names", () => {
    expect(part_name("Book.pdf", [1, 2, 3])).toBe("Book (pages 1-3).pdf");
    expect(part_name("Book.pdf", [5])).toBe("Book (page 5).pdf");
    expect(part_name("Book.pdf", [1, 3])).toBe("Book (pages 1,3).pdf");
    expect(page_image_name("Book.pdf", 7, 120, "png")).toBe("Book - page 007.png");
    expect(page_image_name("Book.pdf", 2, 9, "jpg")).toBe("Book - page 2.jpg");
  });

  test("signature file names", () => {
    expect(signature_file_name("Me")).toBe("Me.svg");
    expect(signature_file_name("me.SVG")).toBe("me.SVG");
    expect(signature_file_name("  ")).toBe("Signature.svg");
    expect(signature_file_name("a/b")).toBe("a-b.svg");
  });
});
