import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_LOCK_DELAY as delay,
  watchBackgroundLock,
} from "./backgroundLock";

describe("Verrouillage après cinq minutes en arrière-plan", () => {
  let doc: EventTarget & { hidden: boolean };
  let win: EventTarget;
  let stop: (() => void) | undefined;
  const lock = vi.fn();
  function visibility(hidden: boolean) {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event("visibilitychange"));
  }
  beforeEach(() => {
    vi.useFakeTimers();
    lock.mockClear();
    doc = Object.assign(new EventTarget(), { hidden: false });
    win = new EventTarget();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
  });
  afterEach(() => {
    stop?.();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("reste ouvert sans interaction au premier plan", () => {
    stop = watchBackgroundLock(lock);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(lock).not.toHaveBeenCalled();
  });
  it("attend exactement cinq minutes en arrière-plan", () => {
    stop = watchBackgroundLock(lock);
    visibility(true);
    vi.advanceTimersByTime(delay - 1);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lock).toHaveBeenCalledOnce();
  });
  it("annule le délai au retour et repart à zéro au prochain départ", () => {
    stop = watchBackgroundLock(lock);
    visibility(true);
    vi.advanceTimersByTime(delay - 1);
    visibility(false);
    vi.advanceTimersByTime(delay * 2);
    expect(lock).not.toHaveBeenCalled();
    visibility(true);
    vi.advanceTimersByTime(delay);
    expect(lock).toHaveBeenCalledOnce();
  });
  it("vérifie la durée au retour même si iOS a gelé les timers", () => {
    stop = watchBackgroundLock(lock);
    visibility(true);
    vi.setSystemTime(Date.now() + delay);
    expect(lock).not.toHaveBeenCalled();
    visibility(false);
    expect(lock).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(delay);
    expect(lock).toHaveBeenCalledOnce();
  });
  it("ignore les événements doublés et reprend aussi via pageshow", () => {
    stop = watchBackgroundLock(lock);
    win.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(delay - 1);
    visibility(true);
    vi.setSystemTime(Date.now() + 1);
    doc.hidden = false;
    win.dispatchEvent(new Event("pageshow"));
    expect(lock).toHaveBeenCalledOnce();
  });
  it("ne lance pas le délai pendant une cérémonie Face ID", () => {
    let prompting = true;
    stop = watchBackgroundLock(lock, () => prompting);
    visibility(true);
    vi.advanceTimersByTime(delay * 2);
    expect(lock).not.toHaveBeenCalled();
    prompting = false;
    visibility(true);
    vi.advanceTimersByTime(delay);
    expect(lock).toHaveBeenCalledOnce();
  });
  it("nettoie ses écouteurs et son timer au verrouillage manuel", () => {
    stop = watchBackgroundLock(lock);
    visibility(true);
    stop();
    vi.advanceTimersByTime(delay);
    visibility(false);
    visibility(true);
    vi.advanceTimersByTime(delay);
    expect(lock).not.toHaveBeenCalled();
  });
});
