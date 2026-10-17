interface TreeLeaf {
  kind: "leaf";
  code: string;
  id: number;
}

interface TreeBranch {
  kind: "branch";
  code: string;
  zero: TreeNode | null;
  one: TreeNode | null;
  ids: number[];
}

type TreeNode = TreeLeaf | TreeBranch;

export interface LayoutNode {
  kind: "leaf" | "branch" | "group";
  code: string;
  x: number;
  depth: number;
  ids: number[];
}

export interface LayoutEdge {
  from: LayoutNode;
  to: LayoutNode;
  bit: "0" | "1";
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  columns: number;
  depth: number;
}

export function code_tree(codes: Map<number, string>): TreeNode | null {
  if (codes.size === 0) return null;
  const root: TreeBranch = { kind: "branch", code: "", zero: null, one: null, ids: [] };
  for (const [id, code] of codes) {
    let node = root;
    node.ids.push(id);
    for (let i = 0; i < code.length; i++) {
      const side = code[i] === "0" ? "zero" : "one";
      const prefix = code.slice(0, i + 1);
      if (i === code.length - 1) {
        node[side] = { kind: "leaf", code: prefix, id };
        break;
      }
      let next = node[side];
      if (next?.kind === "leaf") throw new Error(`${code} is not prefix-free`);
      if (!next) next = node[side] = { kind: "branch", code: prefix, zero: null, one: null, ids: [] };
      next.ids.push(id);
      node = next;
    }
  }
  return root;
}

function children(node: TreeBranch): [TreeNode, "0" | "1"][] {
  const out: [TreeNode, "0" | "1"][] = [];
  if (node.zero) out.push([node.zero, "0"]);
  if (node.one) out.push([node.one, "1"]);
  return out;
}

// Opens branches shallowest first while the bottom row stays within `budget`, so a big alphabet folds its deep tail into groups. The focused code's path always opens.
export function tree_layout(codes: Map<number, string>, { budget = 24, focus }: { budget?: number; focus?: string } = {}): TreeLayout {
  const root = code_tree(codes);
  if (!root) return { nodes: [], edges: [], columns: 0, depth: 0 };

  const open = new Set<string>([""]);
  let terminals = root.kind === "branch" ? children(root).length : 1;
  const queue = root.kind === "branch" ? children(root).map(([child]) => child) : [];
  while (queue.length) {
    const node = queue.shift();
    if (node?.kind !== "branch") continue;
    const next = children(node);
    if (terminals - 1 + next.length > budget) continue;
    open.add(node.code);
    terminals += next.length - 1;
    queue.push(...next.map(([child]) => child));
  }
  if (focus) for (let i = 0; i < focus.length; i++) open.add(focus.slice(0, i));

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let column = 0;
  let depth = 0;
  const place = (node: TreeNode, level: number): LayoutNode => {
    depth = Math.max(depth, level);
    if (node.kind === "leaf") {
      const leaf: LayoutNode = { kind: "leaf", code: node.code, x: column++, depth: level, ids: [node.id] };
      nodes.push(leaf);
      return leaf;
    }
    if (!open.has(node.code)) {
      const group: LayoutNode = { kind: "group", code: node.code, x: column++, depth: level, ids: node.ids };
      nodes.push(group);
      return group;
    }
    const placed = children(node).map(([child, bit]) => [place(child, level + 1), bit] as const);
    const branch: LayoutNode = { kind: "branch", code: node.code, x: placed.reduce((sum, [child]) => sum + child.x, 0) / placed.length, depth: level, ids: node.ids };
    nodes.push(branch);
    for (const [child, bit] of placed) edges.push({ from: branch, to: child, bit });
    return branch;
  };
  place(root, 0);
  return { nodes, edges, columns: column, depth };
}
