import { execFileSync } from "node:child_process";

const ALL = "src/lib/apps/user/";
const LIVE = "https://lilbunnyrabbit.github.io/webos/version.json";

async function live_commit(): Promise<string | null> {
  try {
    const response = await fetch(LIVE, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const { commit } = (await response.json()) as { commit?: unknown };
    return typeof commit === "string" && /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

function changed_files(base: string): string[] | null {
  try {
    return execFileSync("git", ["diff", "--name-only", `${base}..HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

const base = process.argv[2] ?? (await live_commit());
const files = base ? changed_files(base) : null;
if (!files) {
  console.error(`[changed-apps] no diff against the live commit (${base ?? "unreadable"}), running every app's tests`);
  console.log(ALL);
} else {
  const apps = new Set(files.flatMap((file) => /^src\/lib\/apps\/user\/([^/]+)\//.exec(file)?.[1] ?? []));
  console.error(`[changed-apps] since ${base}: ${apps.size > 0 ? [...apps].join(", ") : "no app changed"}`);
  console.log([...apps].map((id) => `${ALL}${id}/`).join(" "));
}
