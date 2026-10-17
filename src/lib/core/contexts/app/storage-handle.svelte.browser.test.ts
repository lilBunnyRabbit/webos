import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, test } from "vitest";
import Owner from "./fixtures/persisted-owner.svelte";

const KEY = "app.persisted-test.cell";
let owner: ReturnType<typeof mount> | null = null;

function open(onready: (cell: { value: { count: number } }) => void = () => {}): { value: { count: number } } {
  let cell: { value: { count: number } } | null = null;
  owner = mount(Owner, {
    target: document.body,
    props: {
      app_id: "persisted-test",
      initial: { count: 0 },
      onready: (opened) => {
        cell = opened;
        onready(opened);
      },
    },
  });
  return cell!;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  flushSync();
}

afterEach(() => {
  if (owner) unmount(owner);
  owner = null;
  flushSync();
  localStorage.removeItem(KEY);
});

describe("storage.persisted", () => {
  test("opening leaves the stored text and a missing key alone", async () => {
    localStorage.setItem(KEY, '{ "count": 4 }');
    const cell = open();
    await settle();
    expect(cell.value.count).toBe(4);
    expect(localStorage.getItem(KEY)).toBe('{ "count": 4 }');

    unmount(owner!);
    owner = null;
    flushSync();
    localStorage.removeItem(KEY);
    open();
    await settle();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("saves a change made before the save effect first runs", async () => {
    open((cell) => (cell.value = { count: 2 }));
    await settle();
    expect(localStorage.getItem(KEY)).toBe('{"count":2}');
  });

  test("saves later changes, including one back to the loaded value", async () => {
    localStorage.setItem(KEY, '{"count":1}');
    const cell = open();
    await settle();
    cell.value.count = 5;
    flushSync();
    expect(localStorage.getItem(KEY)).toBe('{"count":5}');
    cell.value.count = 1;
    flushSync();
    expect(localStorage.getItem(KEY)).toBe('{"count":1}');
  });
});
