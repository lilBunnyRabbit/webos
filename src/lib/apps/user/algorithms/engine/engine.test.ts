import { describe, expect, test } from "vitest";
import { ALGORITHMS_PROPS } from "../props";
import sorting from "../groups/sorting";
import { clean_params, record } from "./definition";
import { parse_algo_file, serialize_algo_file } from "./file";
import { graph, parse_graph } from "./graph-input";
import { InputError, numbers, text } from "./inputs";
import { resolve_input } from "./resolve";
import { layout_tree } from "../views/tree-layout";

describe("inputs", () => {
  const spec = numbers({ sample: [1], max_count: 4, min: 0, max: 9 });

  test("numbers parse with commas or spaces and check their range", () => {
    expect(spec.parse("3, 1 2")).toEqual([3, 1, 2]);
    expect(() => spec.parse("1, x")).toThrow(InputError);
    expect(() => spec.parse("1 2 3 4 5")).toThrow("At most 4");
    expect(() => spec.parse("10")).toThrow("from 0 to 9");
  });

  test("random inputs fit the spec", () => {
    for (let i = 0; i < 50; i++) expect(() => spec.parse(spec.format(spec.random()))).not.toThrow();
  });

  test("text keeps the input as typed", () => {
    expect(text({ sample: "a", max_length: 5 }).parse("ab ab")).toBe("ab ab");
  });

  test("graphs read from edge lists", () => {
    const rules = { directed: false, weighted: true, start: true };
    const parsed = parse_graph("A-B 4, B-C 2; start B", rules);
    expect(parsed.nodes.map((node) => node.id)).toEqual(["A", "B", "C"]);
    expect(parsed.edges).toEqual([
      { from: "A", to: "B", w: 4 },
      { from: "B", to: "C", w: 2 },
    ]);
    expect(parsed.start).toBe("B");
    expect(() => parse_graph("A-B -3", rules)).toThrow("negative");
    expect(() => parse_graph("A-A 1, A-B 2", rules)).toThrow("itself");
    const spec = graph(rules, parsed);
    expect(spec.parse(spec.format(parsed))).toMatchObject({ edges: parsed.edges, start: "B" });
  });
});

describe("resolve_input", () => {
  const bubble = sorting["bubble-sort"];

  test("a link's string goes through the parser, an array through the schema", () => {
    expect(resolve_input(bubble, "3,1,2")).toEqual({ value: [3, 1, 2], error: null });
    expect(resolve_input(bubble, [3, 1, 2])).toEqual({ value: [3, 1, 2], error: null });
    expect(resolve_input(bubble, 7)).toEqual({ value: [7], error: null });
  });

  test("bad input falls back to the sample with a reason", () => {
    const resolved = resolve_input(bubble, "nope");
    expect(resolved.value).toEqual(bubble.input.sample);
    expect(resolved.error).toBeTruthy();
  });
});

describe("params", () => {
  test("only values the algorithm allows survive", () => {
    const quick = sorting["quick-sort"];
    expect(clean_params(quick.params, { pivot: "random" })).toEqual({ pivot: "random" });
    expect(clean_params(quick.params, { pivot: "nonsense", extra: 1 })).toEqual({ pivot: "median" });
  });
});

describe(".algo files", () => {
  test("round-trip", () => {
    const file = { version: 1 as const, algorithm: "quick-sort", input: [3, 1, 2], params: { pivot: "last" } };
    expect(parse_algo_file(serialize_algo_file(file))).toEqual(file);
    expect(parse_algo_file("{}")).toBeNull();
    expect(parse_algo_file("nope")).toBeNull();
  });
});

describe("props", () => {
  test("a link with an array input validates; the app, not the schema, checks the section", () => {
    expect(ALGORITHMS_PROPS.safeParse({ section: "quick-sort", input: [3, 1], params: { pivot: "last" } }).success).toBe(true);
    expect(ALGORITHMS_PROPS.safeParse({ section: "not-an-algorithm" }).success).toBe(true);
  });
});

describe("recording", () => {
  test("stops at the step limit and says so", () => {
    const { truncated, steps } = record(sorting["bubble-sort"], Array.from({ length: 100 }, (_, i) => 100 - i), {}, 50);
    expect(truncated).toBe(true);
    expect(steps).toHaveLength(50);
  });
});

describe("tree layout", () => {
  test("binary trees read in order from left to right", () => {
    const leaf = (id: string) => ({ id, label: id, children: [null, null] });
    const layout = layout_tree([{ id: "5", label: "5", children: [leaf("3"), leaf("8")] }]);
    const x = (id: string) => layout.nodes.find((node) => node.node.id === id)!.x;
    expect(x("3")).toBeLessThan(x("5"));
    expect(x("5")).toBeLessThan(x("8"));
    expect(layout.edges).toHaveLength(2);
  });

  test("a lone right child leans right", () => {
    const layout = layout_tree([{ id: "1", label: "1", children: [null, { id: "2", label: "2", children: [null, null] }] }]);
    const [parent, child] = ["1", "2"].map((id) => layout.nodes.find((node) => node.node.id === id)!);
    expect(child.x).toBeGreaterThan(parent.x);
  });

  test("other trees centre parents over their children", () => {
    const layout = layout_tree([{ id: "r", label: "r", children: [{ id: "a", label: "a", children: [] }, { id: "b", label: "b", children: [] }] }]);
    const [root, a, b] = ["r", "a", "b"].map((id) => layout.nodes.find((node) => node.node.id === id)!);
    expect(root.x).toBeCloseTo((a.x + b.x) / 2);
  });
});
