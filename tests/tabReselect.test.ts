import { describe, expect, it, vi } from "vitest";

import { emitTabReselect, onTabReselect } from "@/lib/navigation/tabReselect";

describe("tab reselect", () => {
  it("tells only the listeners of the tab that was tapped again", () => {
    const home = vi.fn();
    const explore = vi.fn();
    const offHome = onTabReselect("/", home);
    const offExplore = onTabReselect("/explore", explore);

    emitTabReselect("/");
    expect(home).toHaveBeenCalledTimes(1);
    expect(explore).not.toHaveBeenCalled();

    offHome();
    offExplore();
  });

  it("stops calling a listener once unsubscribed", () => {
    const home = vi.fn();
    const off = onTabReselect("/", home);
    off();
    emitTabReselect("/");
    expect(home).not.toHaveBeenCalled();
  });

  it("does nothing for a tab nobody listens to", () => {
    expect(() => emitTabReselect("/settings")).not.toThrow();
  });
});
