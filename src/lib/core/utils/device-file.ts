export interface DeviceFileOptions {
  /** Extensions (".md") or MIME patterns ("image/*"), the same syntax as app associations. Empty = anything. */
  accept?: string[];
  multiple?: boolean;
  /** Opens the camera instead of the chooser on phones; ignored on desktop. */
  capture?: "environment" | "user";
}

/**
 * The browser's own file chooser: files from the real device, read in memory, nothing written to OPFS. Resolves `[]`
 * on cancel.
 */
export function pick_device_files(options: DeviceFileOptions = {}): Promise<File[]> {
  const { accept, multiple = false, capture } = options;
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept?.length) input.accept = accept.join(",");
    if (capture) input.setAttribute("capture", capture);
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}
