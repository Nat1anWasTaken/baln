import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { QuickEntryEditor } from "@/features/entries/quick-entry-editor";
import { API_BASE_URL } from "@/lib/api-client";
import type { Account, AccountType, CreateEntryRequest } from "@/lib/schemas";
import { server } from "@/test/server";

function account(id: number, key: string, name: string, type: AccountType) {
  return {
    id: `01980000-0000-7000-8000-${String(id).padStart(12, "0")}`,
    key,
    name,
    note: null,
    type,
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  } satisfies Account;
}

const accounts: Account[] = [
  account(1, "asset.cash", "現金", "asset"),
  account(2, "liability.card", "信用卡", "liability"),
  account(3, "expense.restaurant", "餐飲", "expense"),
  account(4, "income.salary", "薪資", "income"),
  { ...account(5, "expense.old", "舊分類", "expense"), archived: true },
];

function renderQuickEditor(editorAccounts = accounts) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={["/entries/new"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            path="/entries/new"
            element={<QuickEntryEditor accounts={editorAccounts} />}
          />
          <Route path="/entries/:entryId" element={<p>交易已儲存</p>} />
          <Route path="/accounts" element={<p>帳戶管理</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function captureCreatedEntries() {
  const requests: CreateEntryRequest[] = [];
  server.use(
    http.post(`${API_BASE_URL}/entries`, async ({ request }) => {
      const body = (await request.json()) as CreateEntryRequest;
      requests.push(body);
      return HttpResponse.json(
        {
          id: "01980000-0000-7000-8000-000000000020",
          date: body.date,
          description: body.description,
          note: body.note,
          dedup_key: null,
          excluded_from_budgets: body.excluded_from_budgets,
          created_at: "2026-07-24T00:00:00Z",
          updated_at: "2026-07-24T00:00:00Z",
          postings: [],
        },
        { status: 201 },
      );
    }),
  );
  return requests;
}

describe("quick entry editor", () => {
  it("creates a balanced expense without exposing debit or credit", async () => {
    const user = userEvent.setup();
    const requests = captureCreatedEntries();
    renderQuickEditor();

    expect(screen.queryByText("借方")).not.toBeInTheDocument();
    expect(screen.queryByText("貸方")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "舊分類" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "薪資" })).toBeNull();

    await user.type(screen.getByLabelText("金額"), "320");
    await user.click(screen.getByRole("radio", { name: "餐飲" }));
    await user.click(screen.getByRole("radio", { name: "信用卡" }));
    await user.clear(screen.getByLabelText("交易日期"));
    await user.type(screen.getByLabelText("交易日期"), "2026-07-24");
    await user.type(screen.getByLabelText("交易說明"), " 晚餐 ");
    await user.click(screen.getByRole("button", { name: "建立交易" }));

    await screen.findByText("交易已儲存");
    expect(requests).toEqual([
      {
        date: "2026-07-24",
        description: "晚餐",
        note: null,
        excluded_from_budgets: false,
        dedup_key: null,
        confirmed_distinct: false,
        postings: [
          { account_key: "expense.restaurant", amount_minor: 320, memo: null },
          { account_key: "liability.card", amount_minor: -320, memo: null },
        ],
      },
    ]);
  });

  it("creates income into a funding account and resets the category on kind change", async () => {
    const user = userEvent.setup();
    const requests = captureCreatedEntries();
    renderQuickEditor();

    await user.click(screen.getByRole("radio", { name: "餐飲" }));
    await user.click(screen.getByRole("radio", { name: "收入" }));
    expect(screen.getByText("入帳帳戶")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "薪資" })).not.toBeChecked();

    await user.type(screen.getByLabelText("金額"), "50000");
    await user.click(screen.getByRole("radio", { name: "薪資" }));
    await user.click(screen.getByRole("radio", { name: "現金" }));
    await user.type(screen.getByLabelText("交易說明"), "七月薪資");
    await user.click(screen.getByRole("button", { name: "建立交易" }));

    await screen.findByText("交易已儲存");
    expect(requests[0].postings).toEqual([
      { account_key: "asset.cash", amount_minor: 50000, memo: null },
      { account_key: "income.salary", amount_minor: -50000, memo: null },
    ]);
  });

  it("explains every missing field before submitting", async () => {
    const user = userEvent.setup();
    const requests = captureCreatedEntries();
    renderQuickEditor();

    await user.click(screen.getByRole("button", { name: "建立交易" }));

    expect(
      await screen.findByText("請輸入大於零的整數金額。"),
    ).toBeInTheDocument();
    expect(screen.getByText("請選擇分類。")).toBeInTheDocument();
    expect(screen.getByText("請選擇帳戶。")).toBeInTheDocument();
    expect(screen.getByText("請輸入交易說明。")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    expect(screen.getByLabelText("金額")).toHaveFocus();

    await user.type(screen.getByLabelText("金額"), "1.5");
    expect(screen.getByText("請輸入大於零的整數金額。")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("金額"));
    await user.type(screen.getByLabelText("金額"), "15");
    expect(
      screen.queryByText("請輸入大於零的整數金額。"),
    ).not.toBeInTheDocument();
  });

  it("points to account management when a needed account type is missing", async () => {
    renderQuickEditor(accounts.filter((item) => item.type !== "expense"));

    expect(
      screen.getByText("尚未建立可用的支出帳戶，請先新增帳戶或改用完整模式。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往帳戶管理" })).toHaveAttribute(
      "href",
      "/accounts",
    );
  });
});
