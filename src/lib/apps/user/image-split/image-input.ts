export interface LoadedImage {
  name: string;
  image: HTMLImageElement;
  /** OPFS path when opened from the file system; pasted and dropped images have none. */
  path: string | null;
}

export function is_image_file(file: File): boolean {
  return file.type.startsWith("image/");
}

export async function load_image(file: File, path: string | null = null): Promise<LoadedImage> {
  if (!is_image_file(file)) throw new Error(`${file.name} is not an image`);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { name: file.name, image, path };
}

/** First image among dropped or pasted items. */
export function first_image_file(list: FileList | DataTransferItemList | null | undefined): File | null {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const file = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (file && is_image_file(file)) return file;
  }
  return null;
}

/** Only external file drags count; in-app drags (reordering) are left alone. */
export function has_files(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

export function file_stem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "image";
}

export function parent_path(path: string | null): string | undefined {
  if (!path) return undefined;
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

export function canvas_to_blob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the PNG"))), "image/png");
  });
}
