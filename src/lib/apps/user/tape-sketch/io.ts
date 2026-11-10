import { read_text } from "$kit/utils/file-io";
import { parse_sketch, type Parsed } from "./format";

export { write_file } from "$kit/utils/file-io";

export async function read_path(path: string): Promise<Parsed> {
  return parse_sketch(await read_text(path));
}
