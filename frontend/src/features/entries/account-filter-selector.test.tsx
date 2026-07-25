import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AccountFilterSelector } from "@/features/entries/account-filter-selector";
import type { Account } from "@/lib/schemas";

const accountBase = {
  archived: false,
  note: null,
  created_at: "2026-07-24T00:00:00Z",
  updated_at: "2026-07-24T00:00:00Z",
};

const accounts: Account[] = [
  {
    ...accountBase,
    id: "01980000-0000-7000-8000-000000000001",
    key: "asset.cash",
    name: "現金",
    type: "asset",
  },
  {
    ...accountBase,
    id: "01980000-0000-7000-8000-000000000002",
    key: "liability.card",
    name: "信用卡",
    type: "liability",
  },
  {
    ...accountBase,
    id: "01980000-0000-7000-8000-000000000003",
    key: "expense.restaurant",
    name: "餐飲",
    type: "expense",
  },
  {
    ...accountBase,
    id: "01980000-0000-7000-8000-000000000004",
    key: "asset.old_bank",
    name: "舊銀行",
    type: "asset",
    archived: true,
  },
];

function ControlledSelector({
  initialValue = "all",
}: {
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <AccountFilterSelector
        accounts={accounts}
        value={value}
        onValueChange={setValue}
      />
      <output aria-label="目前帳戶">{value}</output>
    </>
  );
}

describe("account filter selector", () => {
  it("groups accounts and keeps the pills single-select", async () => {
    const user = userEvent.setup();
    render(<ControlledSelector />);

    expect(screen.getByRole("radio", { name: "所有帳戶" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radiogroup", { name: "資產帳戶" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "負債帳戶" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "支出帳戶" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "餐飲" }));

    expect(screen.getByLabelText("目前帳戶")).toHaveTextContent(
      "expense.restaurant",
    );
    expect(screen.getByRole("radio", { name: "餐飲" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "所有帳戶" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("tab", { name: "支出" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "資產" }));
    expect(screen.getByRole("tab", { name: "資產" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("目前帳戶")).toHaveTextContent(
      "expense.restaurant",
    );
  });

  it("searches across account names, keys, and types", async () => {
    const user = userEvent.setup();
    render(<ControlledSelector />);
    const search = screen.getByRole("textbox", { name: "搜尋帳戶選項" });

    await user.type(search, "expense");
    expect(screen.getByRole("radio", { name: "餐飲" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "現金" }),
    ).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "負債");
    expect(screen.getByRole("radio", { name: "信用卡" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "餐飲" }),
    ).not.toBeInTheDocument();
  });

  it("keeps archived accounts collapsed unless opened or selected", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ControlledSelector />);

    expect(
      screen.queryByRole("radio", { name: "舊銀行" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /已封存帳戶/ }));
    expect(screen.getByRole("radio", { name: "舊銀行" })).toBeInTheDocument();

    rerender(
      <ControlledSelector
        key="selected-archived"
        initialValue="asset.old_bank"
      />,
    );
    expect(screen.getByRole("radio", { name: "舊銀行" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows recoverable loading, empty, and error states", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { rerender } = render(
      <AccountFilterSelector
        accounts={[]}
        value="all"
        onValueChange={vi.fn()}
        isLoading
      />,
    );

    expect(screen.getByLabelText("正在載入帳戶選項")).toBeInTheDocument();

    rerender(
      <AccountFilterSelector
        accounts={[]}
        value="asset.cash"
        onValueChange={vi.fn()}
        errorMessage="network error"
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "目前仍依 asset.cash 篩選",
    );
    await user.click(screen.getByRole("button", { name: "重試" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <AccountFilterSelector
        accounts={[]}
        value="all"
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByText("尚未建立帳戶。")).toBeInTheDocument();
  });
});
