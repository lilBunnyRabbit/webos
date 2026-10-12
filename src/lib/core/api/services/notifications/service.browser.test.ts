import { afterEach, describe, expect, test } from "vitest";
import { NotificationsService } from "./service.svelte";
import { NotificationType } from "./type";

let service: NotificationsService;

afterEach(() => service?.destroy());

describe("history cap", () => {
  test("drops the oldest past 50", () => {
    service = new NotificationsService();
    const ids = Array.from({ length: 52 }, (_, index) => service.notify("test", { title: `n${index}`, duration: 0 }));
    for (const id of ids) service.hide_toast(id);
    service.notify("test", { title: "last", duration: 0 });

    expect(service.all).toHaveLength(50);
    expect(service.all[0].title).toBe("last");
    expect(service.all.at(-1)?.title).toBe("n3");
  });

  test("keeps a notification still shown as a toast", () => {
    service = new NotificationsService();
    const progress = service.notify("test", { title: "working", type: NotificationType.PROGRESS, progress: -1 });
    for (let index = 0; index < 60; index++) {
      service.hide_toast(service.notify("test", { title: `n${index}` }));
    }

    expect(service.all).toHaveLength(50);
    expect(service.all.some((notification) => notification.id === progress)).toBe(true);
  });
});
