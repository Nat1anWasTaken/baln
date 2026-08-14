import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function setMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  );
}

function MobileDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent>
        <DialogTitle>編輯項目</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("floating content in a mobile dialog", () => {
  it("portals combobox content into the sheet scroll boundary", async () => {
    setMobileViewport();

    render(
      <MobileDialog>
        <Combobox
          value=""
          onValueChange={() => undefined}
          options={[
            { value: "checking", label: "支票帳戶" },
            { value: "savings", label: "儲蓄帳戶" },
          ]}
        />
      </MobileDialog>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: "支票帳戶" });

    const sheet = screen.getByRole("dialog", { name: "編輯項目" });
    const content = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]',
    );
    expect(sheet).toContainElement(content);
  });

  it("portals dropdown content into the sheet scroll boundary", async () => {
    setMobileViewport();

    render(
      <MobileDialog>
        <DropdownMenu>
          <DropdownMenuTrigger>選擇動作</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>封存</DropdownMenuItem>
            <DropdownMenuItem>刪除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </MobileDialog>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "選擇動作" }), {
      button: 0,
      ctrlKey: false,
    });
    await screen.findByRole("menuitem", { name: "封存" });

    const sheet = screen.getByRole("dialog", { name: "編輯項目" });
    const content = document.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-content"]',
    );
    expect(sheet).toContainElement(content);
  });
});
