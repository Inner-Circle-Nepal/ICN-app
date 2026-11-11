import { describe, expect, it, vi } from "vitest";
import { DOUBLE_TAP_MS, onHomeDoubleTap, registerHomeTabTap } from "@/features/home/homeTabEvents";

describe("double-tapping the Home tab", () => {
  it("fires on a second tap within the window, not on the first", () => {
    const listener = vi.fn();
    const off = onHomeDoubleTap(listener);
    expect(registerHomeTabTap(10_000)).toBe(false);
    expect(registerHomeTabTap(10_000 + DOUBLE_TAP_MS - 50)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("does not fire for two slow taps", () => {
    const listener = vi.fn();
    const off = onHomeDoubleTap(listener);
    registerHomeTabTap(50_000);
    expect(registerHomeTabTap(50_000 + DOUBLE_TAP_MS + 100)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it("needs two fresh taps after a double tap (a triple tap is not two)", () => {
    const listener = vi.fn();
    const off = onHomeDoubleTap(listener);
    registerHomeTabTap(90_000);
    registerHomeTabTap(90_100);
    registerHomeTabTap(90_200);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("stops notifying once unsubscribed", () => {
    const listener = vi.fn();
    const off = onHomeDoubleTap(listener);
    off();
    registerHomeTabTap(120_000);
    registerHomeTabTap(120_100);
    expect(listener).not.toHaveBeenCalled();
  });
});
