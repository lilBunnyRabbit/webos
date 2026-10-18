import type { TreeNode } from "../engine/step";

export interface PlacedNode {
  node: TreeNode;
  x: number;
  y: number;
  width: number;
}

export interface PlacedEdge {
  key: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface TreeLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export const NODE_HEIGHT = 28;
const LEVEL = 64;
const GAP = 10;
const FOREST_GAP = 28;

export const node_width = (label: string) => Math.max(NODE_HEIGHT, label.length * 7.4 + 16);

const is_binary = (node: TreeNode): boolean => node.children.length === 2 && node.children.every((child) => child === null || is_binary(child));

// In-order x for binary trees: a search tree reads sorted left to right and a lone child leans to its side.
export function layout_tree(roots: TreeNode[]): TreeLayout {
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  let cursor = 0;
  let depth_max = 0;

  function inorder(node: TreeNode, depth: number): PlacedNode {
    depth_max = Math.max(depth_max, depth);
    const [left, right] = node.children;
    const placed_left = left ? inorder(left, depth + 1) : null;
    const width = node_width(node.label);
    const placed: PlacedNode = { node, x: cursor + width / 2, y: depth * LEVEL, width };
    cursor += width + GAP;
    nodes.push(placed);
    const placed_right = right ? inorder(right, depth + 1) : null;
    for (const child of [placed_left, placed_right]) if (child) edges.push({ key: `${node.id}-${child.node.id}`, from: placed, to: child });
    return placed;
  }

  function centred(node: TreeNode, depth: number): PlacedNode {
    depth_max = Math.max(depth_max, depth);
    const width = node_width(node.label);
    const children = node.children.filter((child): child is TreeNode => child !== null).map((child) => centred(child, depth + 1));
    let x: number;
    if (children.length === 0) {
      x = cursor + width / 2;
      cursor += width + GAP;
    } else {
      x = (children[0].x + children.at(-1)!.x) / 2;
      const right_edge = x + width / 2 + GAP;
      if (right_edge > cursor) cursor = right_edge;
    }
    const placed: PlacedNode = { node, x, y: depth * LEVEL, width };
    nodes.push(placed);
    for (const child of children) edges.push({ key: `${node.id}-${child.node.id}`, from: placed, to: child });
    return placed;
  }

  for (const root of roots) {
    if (is_binary(root)) inorder(root, 0);
    else centred(root, 0);
    cursor += FOREST_GAP;
  }

  return { nodes, edges, width: Math.max(NODE_HEIGHT, cursor - FOREST_GAP - GAP), height: depth_max * LEVEL + NODE_HEIGHT };
}
