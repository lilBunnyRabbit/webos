import type { FilesService } from "$lib/core/api";
import { available_name } from "$lib/core/api/services/files/opfs";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { file_name_for, is_own_origin, normalize_url, serialize_web_app, type WebApp } from "./web-app";

export function url_error(input: string, origin: string): string | null {
  const url = normalize_url(input);
  if (!url) return "Enter a web address, like example.com";
  if (is_own_origin(url, origin)) return "WebOS can't open itself as a web app";
  return null;
}

export async function read_web_app(files: FilesService, path: string): Promise<string | null> {
  const file = await files.get_file(path);
  return file ? file.text() : null;
}

export async function write_web_app(files: FilesService, folder: string, app: WebApp): Promise<string> {
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`${folder} is missing`);
  const name = await available_name(directory, file_name_for(app.name));
  await files.create_file(directory, name, { content: serialize_web_app(app) });
  return join_path(split_path(folder), name);
}
