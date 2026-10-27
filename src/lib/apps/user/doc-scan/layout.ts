/** A4's short side in points: pages print at A4 width, as long as the photographed page is. */
const PAGE_WIDTH = 595.28;

const pad = (value: number) => String(value).padStart(2, "0");

export function scan_name(date = new Date()): string {
  return `Scan ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.pdf`;
}

export function page_points(width: number, height: number): { width: number; height: number } {
  return width <= height ? { width: PAGE_WIDTH, height: (PAGE_WIDTH * height) / width } : { width: (PAGE_WIDTH * width) / height, height: PAGE_WIDTH };
}
