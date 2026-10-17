// Kept apart from geometry.ts and naming.ts: the manifest imports these at boot, and a module the app also imports
// lands whole in the boot chunk.
export const PageSize = { A4: "a4", LETTER: "letter", IMAGE: "image" } as const;
export type PageSize = (typeof PageSize)[keyof typeof PageSize];

export function is_image_name(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(name);
}
