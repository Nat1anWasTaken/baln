import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { EntryCard } from "@/components/entry-list-item";
import type { EntryResponse } from "@/lib/schemas";

const entry: EntryResponse = {
  id: "00000000-0000-4000-8000-000000000001",
  date: "2026-07-25",
  description: "午餐",
  note: null,
  dedup_key: null,
  excluded_from_budgets: false,
  postings: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      account: {
        id: "00000000-0000-4000-8000-000000000003",
        key: "expense.food",
        name: "餐飲",
        type: "expense",
      },
      amount_minor: 180,
      memo: null,
      created_at: "2026-07-25T12:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      account: {
        id: "00000000-0000-4000-8000-000000000005",
        key: "asset.cash",
        name: "現金",
        type: "asset",
      },
      amount_minor: -180,
      memo: null,
      created_at: "2026-07-25T12:00:00Z",
    },
  ],
  created_at: "2026-07-25T12:00:00Z",
  updated_at: "2026-07-25T12:00:00Z",
};

describe("EntryCard", () => {
  it("includes the account type and name in compact posting badges", () => {
    render(
      <MemoryRouter>
        <EntryCard entry={entry} />
      </MemoryRouter>,
    );

    expect(screen.getByText("支出 · 餐飲")).toBeInTheDocument();
    expect(screen.getByText("資產 · 現金")).toBeInTheDocument();
  });

  it("marks entries excluded from budgets", () => {
    render(
      <MemoryRouter>
        <EntryCard entry={{ ...entry, excluded_from_budgets: true }} />
      </MemoryRouter>,
    );

    expect(screen.getByText("不計入預算")).toBeInTheDocument();
  });

  it("uses the whole card as one transaction detail link", () => {
    render(
      <MemoryRouter>
        <EntryCard entry={entry} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "查看 午餐" })).toHaveAttribute(
      "href",
      "/entries/00000000-0000-4000-8000-000000000001",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("preserves the configured list filters in the detail link", () => {
    render(
      <MemoryRouter>
        <EntryCard
          entry={entry}
          listSearch="?q=%E5%8D%88%E9%A4%90&account=expense.food"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "查看 午餐" })).toHaveAttribute(
      "href",
      "/entries/00000000-0000-4000-8000-000000000001?q=%E5%8D%88%E9%A4%90&account=expense.food",
    );
  });

  it("truncates long descriptions alongside the fixed amount action", () => {
    render(
      <MemoryRouter>
        <EntryCard
          entry={{
            ...entry,
            description: "全家便利商店 — 藍—成人加長不黏身雨衣",
          }}
        />
      </MemoryRouter>,
    );

    const title = screen.getByText("全家便利商店 — 藍—成人加長不黏身雨衣");

    expect(title).toHaveClass("truncate");
    expect(title.parentElement).toHaveClass(
      "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
    );
  });
});
