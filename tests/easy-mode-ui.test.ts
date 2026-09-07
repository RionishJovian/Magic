import { describe, expect, it } from "vitest";
import {
  easyGreeting,
  easyGuestEmptyState,
  easyRouterState,
  uniquePlanDetail,
} from "../src/lib/easy-mode-ui";

describe("Easy Mode UI state", () => {
  it("uses a time-appropriate greeting", () => {
    expect(easyGreeting(8)).toBe("Good morning");
    expect(easyGreeting(14)).toBe("Good afternoon");
    expect(easyGreeting(21)).toBe("Good evening");
  });

  it("does not claim there is no router while the router list is loading", () => {
    expect(easyRouterState({ isPending: true, isError: false })).toEqual({
      label: "Checking connected routers…",
      state: "loading",
    });
  });

  it("distinguishes an empty router list from a failed request", () => {
    expect(easyRouterState({ isPending: false, isError: false }).state).toBe("empty");
    expect(easyRouterState({ isPending: false, isError: true }).state).toBe("error");
  });

  it("keeps the connected router name", () => {
    expect(easyRouterState({ isPending: false, isError: false, routerName: "KoZay" })).toEqual({
      label: "KoZay",
      state: "ready",
    });
  });

  it("hides duplicate plan detail while preserving a real allowance", () => {
    expect(uniquePlanDetail("WC600", " wc600 ")).toBeNull();
    expect(uniquePlanDetail("Morning pass", "4 hours")).toBe("4 hours");
  });

  it("does not show an empty guest state during loading", () => {
    expect(
      easyGuestEmptyState({ routerState: "ready", livePending: true, liveError: false }),
    ).toEqual({ message: "Checking live guests…", action: null });
  });

  it("guides operators to connect a missing router", () => {
    expect(
      easyGuestEmptyState({ routerState: "empty", livePending: false, liveError: false }),
    ).toEqual({ message: "Connect a router to see live guests.", action: "connect" });
  });
});
