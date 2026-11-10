import { read_text } from "$kit/utils/file-io";
import { parse_wire } from "./format";
import type { Wire } from "./model";

export { write_file } from "$kit/utils/file-io";

export async function read_path(path: string): Promise<Wire> {
  return parse_wire(await read_text(path));
}
