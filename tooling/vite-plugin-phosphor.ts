import type { Plugin } from "vite";

const STRIPPED = ["thin", "light"];
const COMPONENT = /phosphor-svelte\/lib\/[^/]+\.svelte$/;
const CHAIN = /\{#if weight === "\w+"\}[\s\S]*?\{\/if\}/;
const HEADER = /\{(?:#if|:else if) weight === "(\w+)"\}|\{:else\}/g;

interface Branch {
  weight: string | null;
  body: string;
}

function split_branches(chain: string): { branches: Branch[]; end: string } {
  const branches: Branch[] = [];
  const headers = [...chain.matchAll(HEADER)];
  for (const [index, header] of headers.entries()) {
    const start = header.index + header[0].length;
    const stop = headers[index + 1]?.index ?? chain.lastIndexOf("{/if}");
    branches.push({ weight: header[1] ?? null, body: chain.slice(start, stop) });
  }
  return { branches, end: chain.slice(chain.lastIndexOf("{/if}")) };
}

/** Rebuilds the weight chain without the stripped branches. Those weights fall back to regular. */
export function strip_weights(code: string): string {
  const chain = code.match(CHAIN)?.[0];
  if (!chain) return code;

  const { branches, end } = split_branches(chain);
  const kept = branches.filter((branch) => !branch.weight || !STRIPPED.includes(branch.weight));
  const rebuilt = kept
    .map(({ weight, body }, index) => {
      if (weight === null) return `{:else}${body}`;
      const condition =
        weight === "regular"
          ? ["regular", ...STRIPPED].map((name) => `weight === "${name}"`).join(" || ")
          : `weight === "${weight}"`;
      return `{${index === 0 ? "#if" : ":else if"} ${condition}}${body}`;
    })
    .join("");

  return code.replace(chain, rebuilt + end);
}

/**
 * Phosphor ships all six weights in every icon component; WebOS uses four. Dropping `thin` and `light` takes their
 * paths out of every icon in the bundle (ADR-036).
 */
export function phosphor_plugin(): Plugin {
  return {
    name: "webos-phosphor-weights",
    enforce: "pre",
    transform(code, id) {
      if (!COMPONENT.test(id)) return;
      return { code: strip_weights(code), map: null };
    },
  };
}

const BARREL_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']phosphor-svelte["'];?/g;

/** `import { A, B as C } from "phosphor-svelte"` → one default import per icon file. */
export function direct_icon_imports(code: string): string {
  return code.replace(BARREL_IMPORT, (_, specifiers: string) =>
    specifiers
      .split(",")
      .map((specifier) => specifier.trim())
      .filter((specifier) => specifier.length > 0)
      .map((specifier) => {
        const [imported, local = imported] = specifier.split(/\s+as\s+/);
        return `import ${local} from "phosphor-svelte/lib/${imported}";`;
      })
      .join("\n")
  );
}

/**
 * Rollup gives a manual chunk every static dependency of its modules, so one icon taken through the barrel would put
 * every icon some app uses into `core` (`vite-core-chunk.ts`). Runs on the compiled module, after types are gone.
 */
export function phosphor_imports_plugin(): Plugin {
  return {
    name: "webos-phosphor-imports",
    apply: "build",
    transform(code, id) {
      if (id.includes("/node_modules/") || !code.includes("phosphor-svelte")) return;
      return { code: direct_icon_imports(code), map: null };
    },
  };
}
