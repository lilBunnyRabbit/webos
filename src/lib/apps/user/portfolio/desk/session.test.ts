import { describe, expect, test } from "vitest";
import { Win, WINDOWS } from "./script";
import { PortfolioSession, TourState } from "./session.svelte";

const fresh = () => {
  const session = new PortfolioSession(false);
  session.tour = TourState.DONE;
  return session;
};

describe("terminal session", () => {
  test("a word that isn't a command answers the way searching for it would", () => {
    const session = fresh();
    session.submit("react");
    const entry = session.log.at(-1)!;
    expect(entry.navigated).toBe(true);
    expect(entry.lines.map((line) => line.text)).toContain("React");
    expect(session.is_open(Win.TIMELINE)).toBe(true);
  });

  test("a word nothing matches is still an error with a way out", () => {
    const session = fresh();
    session.submit("zzzz");
    const entry = session.log.at(-1)!;
    expect(entry.navigated).toBe(false);
    expect(entry.lines[0].text).toBe("command not found: zzzz");
  });

  test("commands that open a window navigate, so a phone shows no sheet over them; help does not", () => {
    const session = fresh();
    session.submit("work astra");
    expect(session.log.at(-1)!.navigated).toBe(true);
    session.submit("help");
    expect(session.log.at(-1)!.navigated).toBe(false);
  });

  test("taking over by typing leaves the whole composed layout without Contact over it, a drag only stops the tour", () => {
    const typing = new PortfolioSession(false);
    typing.submit("whoami");
    typing.pause(true);
    expect(WINDOWS.filter((id) => id !== Win.CONTACT).every((id) => typing.is_open(id))).toBe(true);
    expect(typing.is_open(Win.CONTACT)).toBe(false);
    // Everything is open, so the footer offers replay: resume would only have replayed the principle pass.
    expect(typing.tour).toBe(TourState.DONE);

    const dragging = new PortfolioSession(false);
    dragging.submit("whoami");
    dragging.pause();
    expect(dragging.open).toEqual([Win.IDENTITY]);
    expect(dragging.tour).toBe(TourState.PAUSED);
  });

  test("skip opens every window but Contact on the desktop, and every window on a phone", () => {
    const desktop = new PortfolioSession(false);
    desktop.submit("whoami");
    desktop.skip();
    expect(desktop.tour).toBe(TourState.DONE);
    expect(WINDOWS.filter((id) => id !== Win.CONTACT).every((id) => desktop.is_open(id))).toBe(true);
    expect(desktop.is_open(Win.CONTACT)).toBe(false);

    const phone = new PortfolioSession(false);
    phone.stacked = true;
    phone.submit("whoami");
    phone.pause(true);
    expect(WINDOWS.every((id) => phone.is_open(id))).toBe(true);
  });

  test("reduced motion lands on the whole desk without Contact floating over it", () => {
    const desktop = new PortfolioSession(true);
    desktop.start();
    expect(desktop.tour).toBe(TourState.DONE);
    expect(WINDOWS.filter((id) => id !== Win.CONTACT).every((id) => desktop.is_open(id))).toBe(true);
    expect(desktop.is_open(Win.CONTACT)).toBe(false);

    const phone = new PortfolioSession(true);
    phone.stacked = true;
    phone.start();
    expect(WINDOWS.every((id) => phone.is_open(id))).toBe(true);
  });

  test("contact opens its own window, on top of the others", () => {
    const session = fresh();
    session.submit("whoami");
    session.submit("work");
    session.submit("contact");
    expect(session.is_open(Win.CONTACT)).toBe(true);
    expect(session.order.at(-1)).toBe(Win.CONTACT);
  });

  test("how opens the How I build window and lights a principle when named", () => {
    const session = fresh();
    session.submit("how correct");
    expect(session.is_open(Win.HOW)).toBe(true);
    expect(session.lit).toBe("correct");
  });

  test("a lit principle raises the windows whose cards label it, without moving the focus to one of them", () => {
    const session = fresh();
    session.submit("projects");
    session.submit("whoami");
    session.light("lightest");
    expect(session.lit).toBe("lightest");
    expect(session.order.at(-1)).toBe(Win.PROJECTS);
    expect(session.project).toBeNull();
  });

  test("closing every window says how many and leaves the empty page as the answer", () => {
    const session = fresh();
    session.submit("whoami");
    session.submit("work");
    session.submit("close all");
    const entry = session.log.at(-1)!;
    expect(entry.lines[0].text).toBe("Closed 2 windows.");
    expect(entry.navigated).toBe(true);
  });

  test("closing some windows still answers in the panel", () => {
    const session = fresh();
    session.submit("whoami");
    session.submit("work");
    session.submit("close work");
    expect(session.log.at(-1)!.navigated).toBe(false);
  });

  test("on a phone a principle opens in place: nothing pulses a window and scrolls the page away from it", () => {
    const session = fresh();
    session.stacked = true;
    session.submit("projects");
    const before = session.pulses[Win.PROJECTS] ?? 0;
    session.light("lightest");
    expect(session.pulses[Win.PROJECTS] ?? 0).toBe(before);
  });

  test("a link to a section skips the tour and brings that window forward, without Contact over it", () => {
    const session = new PortfolioSession(false);
    session.start_at(Win.TIMELINE);
    expect(session.tour).toBe(TourState.DONE);
    expect(WINDOWS.filter((id) => id !== Win.CONTACT).every((id) => session.is_open(id))).toBe(true);
    expect(session.is_open(Win.CONTACT)).toBe(false);
    expect(session.order.at(-1)).toBe(Win.TIMELINE);
  });

  test("a link to Contact opens it over the whole desk, and a phone's link opens every window", () => {
    const desktop = new PortfolioSession(false);
    desktop.start_at(Win.CONTACT);
    expect(WINDOWS.every((id) => desktop.is_open(id))).toBe(true);
    expect(desktop.order.at(-1)).toBe(Win.CONTACT);
    expect(desktop.take_entrance(Win.CONTACT)?.invited).toBe(true);

    const phone = new PortfolioSession(false);
    phone.stacked = true;
    phone.start_at(Win.PROJECTS);
    expect(WINDOWS.every((id) => phone.is_open(id))).toBe(true);
  });

  test("touch help talks about the Search button, not the / key", () => {
    const session = fresh();
    session.coarse = true;
    session.submit("help");
    expect(session.log.at(-1)!.lines.at(-1)!.text).not.toContain("/");
  });
});
