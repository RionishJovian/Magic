/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TypedConfirmDialog } from "@/components/TypedConfirmDialog";
import { REMOVE_DEVICE_PHRASE } from "@/lib/device-removal";

afterEach(cleanup);

function mount(onConfirm = vi.fn()) {
  render(
    <TypedConfirmDialog
      open
      onOpenChange={() => {}}
      title="Remove the cloud tunnel for CCR_2004?"
      description="This device is already connected."
      typeHint="Type the phrase below exactly to finish removing this device."
      phrase={REMOVE_DEVICE_PHRASE}
      confirmLabel="Remove"
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe("TypedConfirmDialog", () => {
  it("does not remove until Continue then the exact phrase", async () => {
    const user = userEvent.setup();
    const onConfirm = mount();

    expect(screen.queryByLabelText(REMOVE_DEVICE_PHRASE)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const remove = screen.getByRole("button", { name: "Remove" });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    await user.click(remove);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(REMOVE_DEVICE_PHRASE), REMOVE_DEVICE_PHRASE);
    expect((remove as HTMLButtonElement).disabled).toBe(false);
    await user.click(remove);
    expect(onConfirm).toHaveBeenCalledWith(REMOVE_DEVICE_PHRASE);
  });
});
