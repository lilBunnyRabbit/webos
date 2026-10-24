import { load_image, read_pixels } from "$kit/utils/image";
import { decode } from "./index";

export { has_alpha } from "./pixels";

/** The worker decodes what it can (JPEG XL included); SVG needs the page's `<img>`. */
export async function read_image(file: File, signal?: AbortSignal): Promise<ImageData> {
  try {
    return await decode(file, { signal });
  } catch (error) {
    signal?.throwIfAborted();
    if (!file.type.startsWith("image/")) throw error;
    const image = await load_image(file);
    try {
      return read_pixels(image.bitmap);
    } finally {
      image.bitmap.close();
    }
  }
}
