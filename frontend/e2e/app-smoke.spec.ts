import { expect, test, type Page } from "@playwright/test";

const accounts = [
  {
    id: "01980000-0000-7000-8000-000000000001",
    key: "asset.cash",
    name: "現金",
    type: "asset",
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
  {
    id: "01980000-0000-7000-8000-000000000002",
    key: "expense.restaurant",
    name: "餐飲",
    type: "expense",
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
  {
    id: "01980000-0000-7000-8000-000000000003",
    key: "income.salary",
    name: "薪資",
    type: "income",
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
];

const entry = {
  id: "01980000-0000-7000-8000-000000000010",
  date: "2026-07-24",
  description: "早餐",
  note: null,
  dedup_key: null,
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
      amount_minor: 120,
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
      amount_minor: -120,
      memo: null,
      created_at: "2026-07-24T00:00:00Z",
    },
  ],
};

async function mockApi(page: Page) {
  let visibleAccounts = [...accounts];
  let createdEntry: typeof entry | null = null;
  let apiTokens: Array<{
    id: string;
    name: string;
    token_hint: string;
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string;
    status: "active";
  }> = [];

  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/v1/auth/refresh") {
      return route.fulfill({
        json: {
          access_token: "e2e-token",
          token_type: "Bearer",
          expires_in: 900,
        },
      });
    }
    if (path === "/api/v1/auth/me") {
      return route.fulfill({
        json: {
          id: "01980000-0000-7000-8000-000000000099",
          email: "person@example.com",
          display_name: "測試使用者",
          active: true,
          created_at: "2026-07-24T00:00:00Z",
          updated_at: "2026-07-24T00:00:00Z",
        },
      });
    }
    if (path === "/api/v1/auth/api-tokens" && method === "GET") {
      return route.fulfill({ json: apiTokens });
    }
    if (path === "/api/v1/auth/api-tokens" && method === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        expires_at: string | null;
      };
      const created = {
        id: "01980000-0000-7000-8000-000000000088",
        name: body.name,
        token_hint: "baln_pat_…abcd",
        expires_at: body.expires_at,
        last_used_at: null,
        created_at: "2026-07-24T00:00:00Z",
        status: "active" as const,
      };
      apiTokens = [created];
      return route.fulfill({
        status: 201,
        json: {
          ...created,
          token: "baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE",
        },
      });
    }
    if (
      path === "/api/v1/auth/api-tokens/01980000-0000-7000-8000-000000000088" &&
      method === "DELETE"
    ) {
      apiTokens = [];
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/v1/reports/monthly") {
      return route.fulfill({
        json: {
          date_from: "2026-07-01",
          date_to: "2026-08-01",
          income_minor: 50_000,
          expense_minor: 120,
          net_minor: 49_880,
          income_accounts: [
            {
              account_id: accounts[2].id,
              account_key: accounts[2].key,
              account_name: accounts[2].name,
              account_type: accounts[2].type,
              total_minor: 50_000,
            },
          ],
          expense_accounts: [
            {
              account_id: accounts[1].id,
              account_key: accounts[1].key,
              account_name: accounts[1].name,
              account_type: accounts[1].type,
              total_minor: 120,
            },
          ],
        },
      });
    }
    if (path.endsWith("/balance")) {
      const accountId = path.split("/").at(-2);
      return route.fulfill({
        json: {
          account_id: accountId,
          account_key: "asset.cash",
          as_of: "2026-07-24",
          ledger_balance_minor: 10_000,
          display_balance_minor: 10_000,
        },
      });
    }
    if (path.startsWith("/api/v1/accounts/") && method === "DELETE") {
      const accountId = path.split("/").at(-1);
      visibleAccounts = visibleAccounts.filter(
        (account) => account.id !== accountId,
      );
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/v1/accounts") {
      return route.fulfill({ json: visibleAccounts });
    }
    if (path === "/api/v1/entries" && method === "POST") {
      const body = route.request().postDataJSON() as {
        date: string;
        description: string;
        note: string | null;
        postings: Array<{
          account_key: string;
          amount_minor: number;
          memo: string | null;
        }>;
        confirmed_distinct?: boolean;
      };
      if (!body.confirmed_distinct) {
        return route.fulfill({
          status: 409,
          contentType: "application/problem+json",
          json: {
            type: "https://baln.local/problems/possible_duplicate",
            title: "Conflict",
            status: 409,
            code: "possible_duplicate",
            detail: "one or more entries may already be recorded",
            fields: {
              matches: [
                {
                  pending_entry_number: 1,
                  existing_entries: [entry],
                  pending_entry_numbers: [],
                },
              ],
            },
          },
        });
      }
      createdEntry = {
        ...entry,
        id: "01980000-0000-7000-8000-000000000020",
        date: body.date,
        description: body.description,
        note: body.note,
        dedup_key: null,
        postings: body.postings.map((posting, index) => {
          const account = accounts.find(
            (candidate) => candidate.key === posting.account_key,
          )!;
          return {
            id: `01980000-0000-7000-8000-${String(index + 21).padStart(12, "0")}`,
            account: {
              id: account.id,
              key: account.key,
              name: account.name,
              type: account.type,
            },
            amount_minor: posting.amount_minor,
            memo: posting.memo,
            created_at: "2026-07-24T00:00:00Z",
          };
        }),
      };
      return route.fulfill({ status: 201, json: createdEntry });
    }
    if (
      path === "/api/v1/entries/01980000-0000-7000-8000-000000000020" &&
      method === "GET" &&
      createdEntry
    ) {
      return route.fulfill({ json: createdEntry });
    }
    if (path === "/api/v1/entries" && method === "GET") {
      return route.fulfill({ json: { items: [entry], next_cursor: null } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("renders the authenticated dashboard on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect(
    page.getByText(/TWD\s+50,000/, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("早餐", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "開啟使用者選單" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "主要導覽" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "總覽" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("link", { name: "新增交易" }).click();
  await expect(page.getByRole("heading", { name: "新增交易" })).toBeVisible();
  await expect(page.getByRole("link", { name: "新增交易" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("link", { name: "交易", exact: true }),
  ).not.toHaveAttribute("aria-current");
});

test("opens the advanced balanced-postings editor", async ({ page }) => {
  await page.goto("/entries/new");

  await expect(page.getByRole("heading", { name: "新增交易" })).toBeVisible();
  await page.getByRole("tab", { name: "進階分錄" }).click();
  await expect(page.getByText("借方合計")).toBeVisible();
  await expect(page.getByRole("button", { name: "新增分錄" })).toBeVisible();
});

test("reviews a possible duplicate across responsive themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entries/new");

  await page.getByLabel("交易日期").fill("2026-07-24");
  await page.getByLabel("交易說明").fill("Email receipt");
  await page.getByLabel("金額（TWD）").fill("120");
  await page.getByRole("combobox", { name: "支出分類" }).click();
  await page.getByRole("option", { name: "餐飲" }).click();
  await page.getByRole("combobox", { name: "付款帳戶" }).click();
  await page.getByRole("option", { name: "現金" }).click();
  await page.getByRole("button", { name: "建立交易" }).click();

  const duplicateDialog = page.getByRole("alertdialog", {
    name: "可能重複的交易",
  });
  await expect(duplicateDialog).toBeVisible();
  await expect(duplicateDialog.getByText("早餐")).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "取消" }).click();
  await expect(page.getByLabel("交易說明")).toHaveValue("Email receipt");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "切換顯示模式" }).click();
  await page.getByRole("menuitem", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "建立交易" }).click();
  const darkDuplicateDialog = page.getByRole("alertdialog", {
    name: "可能重複的交易",
  });
  await darkDuplicateDialog.getByRole("button", { name: "仍要建立" }).click();

  await expect(page).toHaveURL(
    /\/entries\/01980000-0000-7000-8000-000000000020$/,
  );
  await expect(page.getByText("Email receipt")).toBeVisible();
});

test("deletes an account after responsive destructive confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/accounts");

  await expect(page.getByRole("heading", { name: "帳戶" })).toBeVisible();
  await page.getByRole("button", { name: "刪除 現金" }).click();
  await expect(page.getByText("刪除「現金」？")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "切換顯示模式" }).click();
  await page.getByRole("menuitem", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "刪除 現金" })).toBeVisible();
  await page.getByRole("button", { name: "刪除 現金" }).click();
  await expect(page.getByText("刪除「現金」？")).toBeVisible();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(
    page.getByRole("button", { name: "刪除 現金" }),
  ).not.toBeVisible();
});

test("creates, reveals, and revokes a personal API token", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /測試使用者/ }).click();
  await page.getByRole("menuitem", { name: "API 權杖" }).click();
  await expect(
    page.getByRole("heading", { name: "個人 API 權杖" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "建立第一個權杖" }).click();
  await page.getByLabel("名稱").fill("E2E 自動化");
  await page.getByRole("button", { name: "建立權杖" }).click();

  await expect(
    page.getByText("這是唯一一次顯示完整權杖。關閉後將無法再次查看。"),
  ).toBeVisible();
  await expect(
    page.getByText("baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE"),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已儲存" }).click();

  await expect(page.getByText("E2E 自動化")).toBeVisible();
  await page.getByRole("button", { name: "撤銷" }).click();
  await page.getByRole("button", { name: "撤銷權杖" }).click();
  await expect(page.getByText("還沒有 API 權杖")).toBeVisible();
});
