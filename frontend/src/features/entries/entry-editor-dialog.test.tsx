import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntryEditor } from "@/features/entries/entry-editor";
import { API_BASE_URL } from "@/lib/api-client";
import type { CreateEntryRequest, EntryResponse } from "@/lib/schemas";
import { server } from "@/test/server";

const accounts = [
  {
    id: "01980000-0000-7000-8000-000000000001",
    key: "asset.cash",
    name: "現金",
    note: null,
    type: "asset" as const,
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
  {
    id: "01980000-0000-7000-8000-000000000002",
    key: "expense.restaurant",
    name: "餐飲",
    note: null,
    type: "expense" as const,
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
];

const existingEntry: EntryResponse = {
  id: "01980000-0000-7000-8000-000000000010",
  date: "2026-07-24",
  description: "Apple Pay 午餐",
  note: null,
  dedup_key: "mcp:apple-pay",
  created_at: "2026-07-24T00:00:00Z",
  updated_at: "2026-07-24T00:00:00Z",
  postings: [
    {
      id: "01980000-0000-7000-8000-000000000011",
      account: {
        id: accounts[1].id,
        key: accounts[1].key,
        name: accounts[1].name,
        type: accounts[1].type,
      },
      amount_minor: 320,
      memo: null,
      created_at: "2026-07-24T00:00:00Z",
    },
    {
      id: "01980000-0000-7000-8000-000000000012",
      account: {
        id: accounts[0].id,
        key: accounts[0].key,
        name: accounts[0].name,
        type: accounts[0].type,
      },
      amount_minor: -320,
      memo: null,
      created_at: "2026-07-24T00:00:00Z",
    },
  ],
};

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

afterEach(() => vi.unstubAllGlobals());

function renderMobileEditor(entry?: EntryResponse) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={["/entries/new"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            path="/entries/new"
            element={<EntryEditor accounts={accounts} entry={entry} />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={["/entries/new"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            path="/entries/new"
            element={<EntryEditor accounts={accounts} />}
          />
          <Route path="/entries/:entryId" element={<p>交易已儲存</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function fillEntry(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText("交易日期"));
  await user.type(screen.getByLabelText("交易日期"), "2026-07-24");
  await user.type(screen.getByLabelText("交易說明"), "Email receipt");

  const accountInputs = screen.getAllByRole("combobox", { name: "帳戶" });
  await user.click(accountInputs[0]);
  await user.click(screen.getByRole("option", { name: "餐飲" }));
  await user.click(accountInputs[1]);
  await user.click(screen.getByRole("option", { name: "現金" }));

  for (const amountInput of screen.getAllByLabelText("金額")) {
    await user.clear(amountInput);
    await user.type(amountInput, "320");
  }
}

describe("mobile posting editor", () => {
  it("discards canceled edits and applies completed edits to the summary", async () => {
    setMobileViewport();
    const user = userEvent.setup();
    renderMobileEditor(existingEntry);

    const firstPosting = screen.getByRole("button", {
      name: "編輯第 1 筆分錄",
    });
    expect(within(firstPosting).getByText("餐飲")).toBeInTheDocument();
    expect(within(firstPosting).getByText(/320/)).toBeInTheDocument();

    await user.click(firstPosting);
    let postingSheet = await screen.findByRole("dialog", {
      name: "編輯第 1 筆分錄",
    });
    await user.clear(within(postingSheet).getByLabelText("金額"));
    await user.type(within(postingSheet).getByLabelText("金額"), "999");
    await user.type(within(postingSheet).getByLabelText("分錄備註"), "不保留");
    await user.click(
      within(postingSheet).getByRole("button", { name: "取消" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "編輯第 1 筆分錄" }),
      ).not.toBeInTheDocument(),
    );

    await user.click(firstPosting);
    postingSheet = await screen.findByRole("dialog", {
      name: "編輯第 1 筆分錄",
    });
    expect(within(postingSheet).getByLabelText("金額")).toHaveValue(320);
    expect(within(postingSheet).getByLabelText("分錄備註")).toHaveValue("");

    await user.clear(within(postingSheet).getByLabelText("金額"));
    await user.type(within(postingSheet).getByLabelText("金額"), "450");
    await user.type(within(postingSheet).getByLabelText("分錄備註"), "午餐");
    await user.click(
      within(postingSheet).getByRole("button", { name: "完成" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "編輯第 1 筆分錄" }),
      ).not.toBeInTheDocument(),
    );

    expect(within(firstPosting).getByText(/450/)).toBeInTheDocument();
    expect(within(firstPosting).getByText("午餐")).toBeInTheDocument();
  });

  it("validates a new posting before append and removes it from its sheet", async () => {
    setMobileViewport();
    const user = userEvent.setup();
    renderMobileEditor();

    await user.click(screen.getByRole("button", { name: "編輯第 1 筆分錄" }));
    let postingSheet = await screen.findByRole("dialog", {
      name: "編輯第 1 筆分錄",
    });
    expect(
      within(postingSheet).getByRole("button", {
        name: "移除第 1 筆分錄",
      }),
    ).toBeDisabled();
    await user.click(
      within(postingSheet).getByRole("button", { name: "取消" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "編輯第 1 筆分錄" }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "新增分錄" }));
    postingSheet = await screen.findByRole("dialog", { name: "新增分錄" });
    await user.click(
      within(postingSheet).getByRole("button", { name: "完成" }),
    );
    expect(within(postingSheet).getByText("請選擇帳戶。")).toBeInTheDocument();
    expect(
      within(postingSheet).getByText("請輸入大於零的整數金額。"),
    ).toBeInTheDocument();

    await user.click(
      within(postingSheet).getByRole("combobox", { name: "帳戶" }),
    );
    await user.click(await screen.findByRole("option", { name: "餐飲" }));
    await user.type(within(postingSheet).getByLabelText("金額"), "120");
    await user.type(within(postingSheet).getByLabelText("分錄備註"), "加點");
    await user.click(
      within(postingSheet).getByRole("button", { name: "完成" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "新增分錄" }),
      ).not.toBeInTheDocument(),
    );

    const thirdPosting = screen.getByRole("button", {
      name: "編輯第 3 筆分錄",
    });
    expect(within(thirdPosting).getByText("餐飲")).toBeInTheDocument();
    expect(within(thirdPosting).getByText(/120/)).toBeInTheDocument();
    expect(within(thirdPosting).getByText("加點")).toBeInTheDocument();

    await user.click(thirdPosting);
    postingSheet = await screen.findByRole("dialog", {
      name: "編輯第 3 筆分錄",
    });
    await user.click(
      within(postingSheet).getByRole("button", {
        name: "移除第 3 筆分錄",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "編輯第 3 筆分錄" }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("entry duplicate confirmation", () => {
  it("preserves the draft on cancel and retries the exact request after confirmation", async () => {
    const user = userEvent.setup();
    const requests: CreateEntryRequest[] = [];
    server.use(
      http.post(`${API_BASE_URL}/entries`, async ({ request }) => {
        const body = (await request.json()) as CreateEntryRequest;
        requests.push(body);
        if (!body.confirmed_distinct) {
          return HttpResponse.json(
            {
              type: "https://baln.local/problems/possible_duplicate",
              title: "Conflict",
              status: 409,
              code: "possible_duplicate",
              detail: "one or more entries may already be recorded",
              fields: {
                matches: [
                  {
                    pending_entry_number: 1,
                    existing_entries: [existingEntry],
                    pending_entry_numbers: [],
                  },
                ],
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json(
          {
            ...existingEntry,
            id: "01980000-0000-7000-8000-000000000020",
            description: body.description,
            dedup_key: null,
          },
          { status: 201 },
        );
      }),
    );

    renderEditor();
    await fillEntry(user);
    await user.click(screen.getByRole("button", { name: "建立交易" }));

    expect(
      await screen.findByRole("alertdialog", { name: "可能重複的交易" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Apple Pay 午餐")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(requests[0].postings).toEqual([
      {
        account_key: "expense.restaurant",
        amount_minor: 320,
        memo: null,
      },
      { account_key: "asset.cash", amount_minor: -320, memo: null },
    ]);

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("交易說明")).toHaveValue("Email receipt");

    await user.click(screen.getByRole("button", { name: "建立交易" }));
    await screen.findByRole("alertdialog", { name: "可能重複的交易" });
    await user.click(screen.getByRole("button", { name: "仍要建立" }));

    await screen.findByText("交易已儲存");
    expect(requests).toHaveLength(3);
    expect(requests[2]).toEqual({
      ...requests[1],
      confirmed_distinct: true,
    });
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});
