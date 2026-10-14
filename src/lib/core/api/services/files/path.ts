/** `"/docs/a.txt"` → `["docs", "a.txt"]`. Empty segments are dropped, so `"//docs/"` → `["docs"]`. */
export function split_path(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** `["docs"]`, `"a.txt"` → `"/docs/a.txt"`. */
export function join_path(segments: string[], name?: string): string {
  return "/" + (name === undefined ? segments : [...segments, name]).join("/");
}

/**
 * An absolute path from what was typed in a shell at `cwd`: `~` is `/home`, `.` and `..` resolve, `..` stops at `/`.
 */
export function resolve_path(cwd: string, input: string): string {
  const base = input.startsWith("/") ? [] : input === "~" || input.startsWith("~/") ? ["home"] : split_path(cwd);
  const rest = input.startsWith("~") && (input === "~" || input.startsWith("~/")) ? input.slice(1) : input;
  const segments = [...base];
  for (const segment of split_path(rest)) {
    if (segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return join_path(segments);
}

/** `/home/Pictures` → `~/Pictures`, for prompts. */
export function tilde_path(path: string): string {
  return path === "/home" ? "~" : path.startsWith("/home/") ? `~${path.slice(5)}` : path;
}

export function base_name(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `"/docs/a.txt"` → `"/docs"`. Anything directly under the root, and the root itself, → `"/"`. */
export function parent_path(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

/** `"a.tar.gz"` → `"a.tar"`. A dotfile is all stem (`.env` → `".env"`). */
export function file_stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** `"Notes.TXT"` → `".txt"`. A dotfile is its own extension (`.env` → `".env"`). Names without a dot have none. */
export function file_extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}
