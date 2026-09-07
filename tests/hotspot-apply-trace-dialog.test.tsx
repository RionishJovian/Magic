/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { HotspotApplyResult } from "@/lib/wifi-hotspot.server";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

import { HotspotApplyTraceDialog } from "@/components/HotspotApplyTraceDialog";

afterEach(cleanup);

const okResult: HotspotApplyResult = {
  ok: true,
  created: ["IP pool hotspot-pool"],
  skipped: [],
  warnings: [],
  steps: [
    {
      label: "IP pool hotspot-pool",
      path: "/ip/pool",
      op: "put",
      outcome: "created",
      transport: "rest",
      command: "/ip pool add name=hotspot-pool",
    },
  ],
};

const failedRolledBack: HotspotApplyResult = {
  ok: false,
  created: ["IP pool hotspot-pool"],
  skipped: [],
  warnings: [],
  rolledBack: ["IP pool hotspot-pool"],
  error: "Hotspot server failed (rest): boom — rolled back 1 earlier step(s).",
  steps: [
    {
      label: "IP pool hotspot-pool",
      path: "/ip/pool",
      op: "put",
      outcome: "created",
      transport: "rest",
      command: "/ip pool add name=hotspot-pool",
    },
    {
      label: "Hotspot server on bridge-lan",
      path: "/ip/hotspot",
      op: "put",
      outcome: "failed",
      transport: "rest",
      error: "boom",
    },
  ],
};

describe("HotspotApplyTraceDialog", () => {
  it("shows a numbered after-apply checklist and Portal publish nudge", () => {
    render(
      <HotspotApplyTraceDialog
        open
        onOpenChange={() => {}}
        routerName="CafeBoard"
        result={okResult}
        suggestPortalPublish
      />,
    );

    expect(screen.getByText("After apply checklist")).toBeTruthy();
    expect(screen.getByText(/Confirm the guest SSID/i)).toBeTruthy();
    expect(screen.getByText(/Publish Portal — the board still shows/i)).toBeTruthy();
    expect(screen.getByText(/Create or restock vouchers/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Portal → Publish/i })).toBeTruthy();
  });

  it("explains rollback when mid-apply undo succeeded", () => {
    render(
      <HotspotApplyTraceDialog
        open
        onOpenChange={() => {}}
        routerName="CafeBoard"
        result={failedRolledBack}
      />,
    );

    expect(screen.getByText("Hotspot apply stopped")).toBeTruthy();
    expect(screen.getByText("Rolled back on the router")).toBeTruthy();
    expect(screen.getByText(/half-built guest network/i)).toBeTruthy();
    expect(screen.queryByText("After apply checklist")).toBeNull();
  });
});
