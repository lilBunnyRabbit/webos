import { describe, expect, test } from "vitest";
import { ListColor, type Item, type List } from "./data";
import { apply_changes, ChangeKind, read_share, review_share, share_of } from "./share";

const item = (id: string, text: string, updated_at: number, extra: Partial<Item> = {}): Item => ({ id, text, checked: false, updated_at, ...extra });
const list = (items: Item[], extra: Partial<List> = {}): List => ({ id: "groceries", name: "Groceries", color: ListColor.PRIMARY, items, ...extra });

function kinds(local: List[], incoming: List[]) {
  return review_share(local, share_of(incoming)).flatMap((review) => review.changes.map((change) => change.kind));
}

describe("review_share", () => {
  test("new, edited, ticked and deleted items, each only when the incoming version is newer", () => {
    const mine = list([item("a", "mleko", 1), item("b", "kruh", 1), item("c", "sir", 1), item("d", "jajca", 5)]);
    const theirs = list([
      item("a", "mleko", 2, { qty: 2 }),
      item("b", "kruh", 2, { checked: true }),
      item("c", "sir", 2, { deleted_at: 2 }),
      item("d", "jajca", 3, { checked: true }),
      item("e", "moka", 2),
    ]);
    expect(kinds([mine], [theirs])).toEqual([ChangeKind.EDIT, ChangeKind.TICK, ChangeKind.DELETE, ChangeKind.ADD]);
  });

  test("the same list on both sides has nothing to review", () => {
    const both = list([item("a", "mleko", 1), item("b", "kruh", 2, { deleted_at: 2 })]);
    expect(kinds([both], [both])).toEqual([]);
  });

  test("a list this device doesn't have arrives whole", () => {
    const reviews = review_share([], share_of([list([item("a", "mleko", 1), item("b", "x", 1, { deleted_at: 1 })], { id: "home", name: "Home" })]));
    expect(reviews[0].changes).toMatchObject([{ kind: ChangeKind.NEW_LIST, count: 1 }]);
  });

  test("a renamed or recoloured list is offered as a details change", () => {
    expect(kinds([list([])], [list([], { name: "Trgovina", color: ListColor.INFO })])).toEqual([ChangeKind.DETAILS]);
  });
});

describe("apply_changes", () => {
  test("applies only the picked changes", () => {
    const mine = [list([item("a", "mleko", 1)])];
    const share = share_of([list([item("a", "mleko", 2, { checked: true }), item("e", "moka", 2)])]);
    const reviews = review_share(mine, share);
    const add = reviews[0].changes.find((change) => change.kind === ChangeKind.ADD)!;
    expect(apply_changes(mine, share, new Set([add.id]), reviews)).toBe(1);
    expect(mine[0].items.map((entry) => [entry.id, entry.checked])).toEqual([
      ["a", false],
      ["e", false],
    ]);
  });

  test("a payload that isn't a share is refused", () => {
    expect(() => read_share({ v: 2, lists: [] })).toThrow();
    expect(read_share(JSON.parse(JSON.stringify(share_of([list([])]))))).toMatchObject({ v: 1 });
  });
});
