import { read_text } from "$kit/utils/file-io";
import { read_wire } from "./format";
import type { Wire } from "./model";

export { write_file } from "$kit/utils/file-io";

export async function read_path(path: string): Promise<{ wire: Wire; dropped: number }> {
  return read_wire(await read_text(path));
}
