/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDelayedLoading, SKELETON_DELAY_MS } from "@/hooks/useDelayedLoading";

describe("useDelayedLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays false until the delay elapses while active", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedLoading(active, SKELETON_DELAY_MS),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it("never shows when deactivated before the delay", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedLoading(active, SKELETON_DELAY_MS),
      { initialProps: { active: true } },
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(result.current).toBe(false);
  });
});
