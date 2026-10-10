/** `"/docs/a.txt"` → `["docs", "a.txt"]`. Empty segments are dropped, so `"//docs/"` → `["docs"]`. */
export function split_path(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** `["docs"]`, `"a.txt"` → `"/docs/a.txt"`. */
export function join_path(segments: string[], name?: string): string {
  return "/" + (name === undefined ? segments : [...segments, name]).join("/");
}
