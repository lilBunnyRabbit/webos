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
