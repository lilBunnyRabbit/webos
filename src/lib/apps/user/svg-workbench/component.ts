import type { CustomPlugin, XastElement, XastParent } from "svgo/browser";
import { load_svgo } from "./optimize";

const PAINTS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"];
const COLOR = "__webos_color__";
const DROPPED_ROOT = new Set(["width", "height", "xmlns"]);

export interface ComponentOptions {
  size: number;
  /** Every solid paint becomes the `color` prop: right for one-colour icons, flattens a multi-colour picture. */
  recolor: boolean;
}

const is_root = (parent: XastParent) => parent.type === "root";
const is_solid = (value: string) => !/^(none|transparent|inherit|url\(.*)$/i.test(value.trim());

function style_paints(style: string): string[] {
  return [...style.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/gi)]
    .filter(([, name]) => PAINTS.includes(name.toLowerCase()))
    .map(([, , value]) => value.trim());
}

export async function paint_colors(svg: string): Promise<string[]> {
  const { optimize } = await load_svgo();
  const found = new Set<string>();
  const collect: CustomPlugin = {
    name: "webos-collect-paints",
    fn: () => ({
      element: {
        enter(node: XastElement) {
          const values = [...PAINTS.map((name) => node.attributes[name]), ...style_paints(node.attributes.style ?? "")];
          for (const value of values) if (value !== undefined && is_solid(value)) found.add(value.trim().toLowerCase());
        },
      },
    }),
  };
  optimize(svg, { plugins: [collect] });
  return [...found];
}

function escape_braces(text: string): string {
  return text.replace(/[{}]/g, (brace) => `{'${brace}'}`);
}

// Svelte keeps a nested <style> as raw text, so braces there stay as they are.
function escape_markup(markup: string): string {
  return markup
    .split(/(<style\b[^>]*>[\s\S]*?<\/style>)/i)
    .map((part, index) => (index % 2 ? part : escape_braces(part)))
    .join("");
}

function attribute_text(name: string, value: string): string {
  return `${name}="${escape_braces(value.replace(/"/g, "&quot;"))}"`;
}

export async function svelte_component(svg: string, { size, recolor }: ComponentOptions): Promise<string> {
  const { optimize } = await load_svgo();
  const root: Record<string, string> = {};
  const rewrite: CustomPlugin = {
    name: "webos-component",
    fn: () => ({
      root: {
        enter(node) {
          node.children = node.children.filter((child) => child.type === "element");
        },
      },
      element: {
        enter(node: XastElement, parent: XastParent) {
          if (recolor) {
            for (const name of PAINTS) if (node.attributes[name] !== undefined && is_solid(node.attributes[name])) node.attributes[name] = COLOR;
            if (node.attributes.style) {
              node.attributes.style = node.attributes.style.replace(
                /((?:^|;)\s*)([a-z-]+)(\s*:\s*)([^;]+)/gi,
                (whole, start, name, colon, value) => (PAINTS.includes(name.toLowerCase()) && is_solid(value) ? `${start}${name}${colon}${COLOR}` : whole)
              );
            }
          }
          if (node.name === "svg" && is_root(parent)) {
            Object.assign(root, node.attributes);
            node.attributes = {};
          }
        },
      },
    }),
  };
  const output = optimize(svg, { plugins: [rewrite], js2svg: { pretty: true, indent: 2 } }).data.trim();
  const open = output.indexOf(">", output.indexOf("<svg"));
  const self_closing = output[open - 1] === "/";
  const inner = self_closing ? "" : output.slice(open + 1, output.lastIndexOf("</svg>")).replace(/^\n+|\s+$/g, "");

  if (recolor && root.fill === undefined) root.fill = COLOR;
  const attributes = Object.entries(root)
    .filter(([name]) => !DROPPED_ROOT.has(name))
    .map(([name, value]) => attribute_text(name, value));
  attributes.push("width={size}", "height={size}", "{...rest}");

  const body = escape_markup(inner);
  const markup = `<svg ${attributes.join(" ")}>\n${body}${body ? "\n" : ""}</svg>`;
  const props = recolor
    ? ["    size?: number | string;", "    color?: string;"]
    : ["    size?: number | string;"];
  const defaults = recolor ? `size = ${size}, color = "currentColor"` : `size = ${size}`;

  return [
    `<script lang="ts">`,
    `  import type { SVGAttributes } from "svelte/elements";`,
    ``,
    `  interface Props extends SVGAttributes<SVGSVGElement> {`,
    ...props,
    `  }`,
    ``,
    `  let { ${defaults}, ...rest }: Props = $props();`,
    `</script>`,
    ``,
    markup.replaceAll(`"${COLOR}"`, "{color}").replaceAll(COLOR, "{color}"),
    ``,
  ].join("\n");
}
