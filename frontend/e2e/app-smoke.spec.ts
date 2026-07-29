import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";

const accounts = [
  {
    id: "01980000-0000-7000-8000-000000000001",
    key: "asset.cash",
    name: "現金",
    note: "連結到郵局金融卡",
    type: "asset",
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
  {
    id: "01980000-0000-7000-8000-000000000002",
    key: "expense.restaurant",
    name: "餐飲",
    note: null,
    type: "expense",
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
  {
    id: "01980000-0000-7000-8000-000000000003",
    key: "income.salary",
    name: "薪資",
    note: null,
    type: "income",
    archived: false,
    created_at: "2026-07-24T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  },
];

const entry = {
  id: "01980000-0000-7000-8000-000000000010",
  date: "2026-07-24",
  description: "全家便利商店 — 藍—成人加長不黏身雨衣",
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
  let updatedEntry: typeof entry | null = null;
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
    if (path === "/api/v1/reports/summary") {
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
    if (path === "/api/v1/reports/trend") {
      return route.fulfill({
        json: {
          date_from: url.searchParams.get("date_from"),
          date_to: url.searchParams.get("date_to"),
          granularity: url.searchParams.get("granularity"),
          points: [
            {
              date_from: "2026-07-24",
              date_to: "2026-07-25",
              income_minor: 50_000,
              expense_minor: 120,
              net_minor: 49_880,
            },
          ],
        },
      });
    }
    if (path === "/api/v1/reports/position") {
      return route.fulfill({
        json: {
          as_of: url.searchParams.get("as_of"),
          asset_minor: 60_000,
          liability_minor: 10_000,
          net_worth_minor: 50_000,
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
    if (path.startsWith("/api/v1/accounts/") && method === "PATCH") {
      const accountId = path.split("/").at(-1);
      const body = route.request().postDataJSON() as {
        key?: string;
        name?: string;
        note?: string | null;
        type?: string;
      };
      const current = visibleAccounts.find(
        (account) => account.id === accountId,
      );
      if (!current) return route.fulfill({ status: 404, json: {} });
      const updated = {
        ...current,
        ...body,
        updated_at: "2026-07-25T01:00:00Z",
      };
      visibleAccounts = visibleAccounts.map((account) =>
        account.id === accountId ? updated : account,
      );
      return route.fulfill({ json: updated });
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
    if (
      path === "/api/v1/entries/01980000-0000-7000-8000-000000000010" &&
      method === "PUT"
    ) {
      const body = route.request().postDataJSON() as {
        date: string;
        description: string;
        note: string | null;
        postings: Array<{
          account_key: string;
          amount_minor: number;
          memo: string | null;
        }>;
      };
      updatedEntry = {
        ...entry,
        date: body.date,
        description: body.description,
        note: body.note,
        updated_at: "2026-07-25T01:00:00Z",
        postings: body.postings.map((posting, index) => {
          const account = accounts.find(
            (candidate) => candidate.key === posting.account_key,
          )!;
          return {
            id: `01980000-0000-7000-8000-${String(index + 31).padStart(12, "0")}`,
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
      return route.fulfill({ json: updatedEntry });
    }
    if (
      path === "/api/v1/entries/01980000-0000-7000-8000-000000000010" &&
      method === "GET"
    ) {
      return route.fulfill({ json: updatedEntry ?? entry });
    }
    if (path === "/api/v1/entries" && method === "GET") {
      return route.fulfill({ json: { items: [entry], next_cursor: null } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

async function fillBalancedPostings(page: Page, amount: string) {
  const accountInputs = page.getByRole("combobox", { name: "帳戶" });
  await accountInputs.nth(0).click();
  await page.getByRole("option", { name: "餐飲" }).click();
  await accountInputs.nth(1).click();
  await page.getByRole("option", { name: "現金" }).last().click();

  const amountInputs = page.getByLabel("金額", { exact: true });
  await amountInputs.nth(0).fill(amount);
  await amountInputs.nth(1).fill(amount);
}

async function dragMouse(page: Page, target: Locator, distance: number) {
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  const x = Math.round(bounds!.x + bounds!.width / 2);
  const y = Math.round(bounds!.y + bounds!.height / 2);

  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(x, y + (distance * step) / 8);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

async function dragTouch(page: Page, target: Locator, distance: number) {
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  const x = Math.round(bounds!.x + bounds!.width / 2);
  const y = Math.round(bounds!.y + bounds!.height / 2);
  const client = await page.context().newCDPSession(page);

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + (distance * step) / 8 }],
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function expectEqualSummaryIconSizes(page: Page) {
  const icons = page.locator(
    '[data-finance-tone] [data-slot="card-action"] > span',
  );
  await expect(icons).toHaveCount(3);
  await expect
    .poll(() =>
      icons.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return [bounds.width, bounds.height];
        }),
      ),
    )
    .toEqual([
      [28, 28],
      [28, 28],
      [28, 28],
    ]);
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
  await expect(
    page
      .getByText("全家便利商店 — 藍—成人加長不黏身雨衣", { exact: true })
      .first(),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "每月起始日" }).click();
  await page.getByRole("button", { name: "26 日" }).click();
  await expect(page.getByRole("button", { name: "每月起始日" })).toContainText(
    "每月 26 日開始",
  );
  await expect(page.getByRole("heading", { name: /月期$/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem(
          "baln:month-start-day:01980000-0000-7000-8000-000000000099",
        ),
      ),
    )
    .toBe("26");

  await page.getByLabel("新增交易").click();
  await expect(page.getByRole("dialog", { name: "新增交易" })).toBeVisible();
  await expect(page).toHaveURL(/\/entries\/new$/);
});

test("shows milestone progress until the app route is ready", async ({
  page,
}) => {
  await page.route(
    "http://localhost:8080/api/v1/auth/refresh",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        json: {
          access_token: "e2e-token",
          token_type: "Bearer",
          expires_in: 900,
        },
      });
    },
  );

  await page.goto("/");
  const startup = page.locator("#startup-screen");
  await expect(startup).toBeVisible();
  const progress = startup.getByRole("progressbar");
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeGreaterThan(8);
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeLessThan(100);

  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect(startup).not.toBeAttached();
});

test("provides an installable manifest and profile-menu install action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return Boolean(registration.active);
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: /測試使用者/ }).click();
  await expect(page.getByRole("menuitem", { name: "安裝 Baln" })).toBeVisible();
});

test("keeps iOS install instructions open after the profile menu closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();

  await page.getByRole("button", { name: "開啟使用者選單" }).click();
  await page.getByRole("menuitem", { name: "安裝 Baln" }).click();

  await expect(
    page.getByRole("heading", { name: "將 Baln 加入主畫面" }),
  ).toBeVisible();
  await expect(
    page.getByText("Safari 會把 Baln 安裝成可獨立開啟的應用程式。"),
  ).toBeVisible();
});

test("reopens the cached dashboard in read-only offline mode", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);

  await page.unroute("http://localhost:8080/api/v1/**");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByText(/離線模式・顯示上次同步的資料/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增交易", exact: true }),
  ).toBeDisabled();

  await context.setOffline(false);
});

test("presents spending insights responsively on overview and reports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByText("主要支出", { exact: true })).toBeVisible();
  await expect(page.getByText("財務狀況", { exact: true })).toBeVisible();

  await page.goto("/reports");
  await expect(
    page.getByRole("button", { name: "報表期間：本期" }),
  ).toBeVisible();
  await expectEqualSummaryIconSizes(page);
  await expect(page.getByText("分類分析", { exact: true })).toBeVisible();
  await expect(page.getByText("支出趨勢", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /餐飲/ })).toBeVisible();

  await page.getByRole("button", { name: "切換顯示模式" }).click();
  await page.getByRole("menuitem", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectEqualSummaryIconSizes(page);
  await expect(page.getByText("分類分析", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("主要支出", { exact: true })).toBeVisible();
});

test("keeps long transaction summaries inside mobile cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/entries");

  const description = page
    .locator('[data-slot="card-title"]')
    .getByText("全家便利商店 — 藍—成人加長不黏身雨衣", {
      exact: true,
    });
  const card = page.locator('[data-slot="card"]').filter({ has: description });
  const amount = card.getByText(/TWD\s+120/, { exact: true });

  await expect(description).toBeVisible();
  await expect(amount).toBeVisible();

  const [cardBox, amountBox] = await Promise.all([
    card.boundingBox(),
    amount.boundingBox(),
  ]);
  expect(cardBox).not.toBeNull();
  expect(amountBox).not.toBeNull();
  expect(amountBox!.x + amountBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width,
  );
});

test("shows account notes in responsive lists and the edit dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/accounts");

  const desktopRow = page.getByRole("row").filter({ hasText: "現金" });
  await expect(desktopRow.getByText("連結到郵局金融卡")).toBeVisible();
  await desktopRow.getByRole("button", { name: "編輯 現金" }).click();
  const note = page.getByRole("textbox", { name: "帳戶備註" });
  await expect(note).toHaveValue("連結到郵局金融卡");
  await expect(note).toHaveAttribute("maxlength", "2000");
  await page.getByRole("button", { name: "取消" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = page
    .locator('[data-slot="card"]:visible')
    .filter({ hasText: "現金" });
  await expect(mobileCard.getByText("連結到郵局金融卡")).toBeVisible();
});

test("confirms account key and type changes before updating ledger views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/accounts");

  const row = page.getByRole("row").filter({ hasText: "現金" });
  await row.getByRole("button", { name: "編輯 現金" }).click();
  await page.getByRole("combobox", { name: "帳戶類型" }).click();
  await page.getByRole("option", { name: "負債" }).click();
  await page.getByRole("textbox", { name: "帳戶代碼" }).fill("card.cathay");
  await page.getByRole("button", { name: "儲存" }).click();

  const confirmation = page.getByRole("alertdialog", {
    name: "變更帳戶代碼或類型？",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(
    "asset.cash 變更為 liability.card.cathay",
  );
  await confirmation.getByRole("button", { name: "返回編輯" }).click();
  await expect(page.getByRole("dialog", { name: "編輯帳戶" })).toBeVisible();

  await page.getByRole("button", { name: "儲存" }).click();
  await confirmation.getByRole("button", { name: "確認變更" }).click();
  await expect(
    page.getByRole("dialog", { name: "編輯帳戶" }),
  ).not.toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "現金" })).toContainText(
    "liability.card.cathay",
  );

  await page.getByRole("button", { name: "切換顯示模式" }).click();
  await page.getByRole("menuitem", { name: "深色" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = page
    .locator('[data-slot="card"]:visible')
    .filter({ hasText: "現金" });
  await mobileCard.getByRole("button", { name: "編輯 現金" }).click();
  const mobileDialog = page.getByRole("dialog", { name: "編輯帳戶" });
  await expect(mobileDialog).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(mobileDialog).toHaveAttribute("data-presentation", "sheet");
  await expect(
    mobileDialog.locator('[data-slot="dialog-handle"]'),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await mobileDialog.boundingBox();
      return bounds ? bounds.y + bounds.height : null;
    })
    .toBeLessThanOrEqual(844);
  await dragMouse(
    page,
    mobileDialog.locator('[data-slot="dialog-handle"]'),
    300,
  );
  await expect(mobileDialog).not.toBeVisible();
});

test("dismisses the account edit sheet with a touch drag", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  await mockApi(page);

  try {
    await page.goto("/accounts");

    const accountCard = page
      .locator('[data-slot="card"]:visible')
      .filter({ hasText: "現金" });
    await accountCard.getByRole("button", { name: "編輯 現金" }).click();

    const sheet = page.getByRole("dialog", { name: "編輯帳戶" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-presentation", "sheet");

    await dragTouch(page, sheet.locator('[data-slot="dialog-handle"]'), 300);

    await expect(sheet).not.toBeVisible();
  } finally {
    await context.close();
  }
});

test("groups the responsive transaction account pills by account type", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/entries");

  await expect(
    page.getByRole("radiogroup", { name: "資產帳戶" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "收入帳戶" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "支出帳戶" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "搜尋帳戶選項" }).fill("支出");
  await expect(page.getByRole("radio", { name: "餐飲" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "現金" })).not.toBeVisible();
  await page.getByRole("radio", { name: "餐飲" }).click();
  await expect(page).toHaveURL(/account=expense\.restaurant/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: "支出" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("radio", { name: "餐飲" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "所有帳戶" }).click();
  await page.getByRole("tab", { name: "支出" }).click();
  await expect(page.getByRole("radio", { name: "餐飲" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "現金" })).not.toBeVisible();
});

test("separates account and transaction filters", async ({ page }) => {
  const assertFilterOrder = async () => {
    const accountLabel = page
      .getByText("帳戶", { exact: true })
      .filter({ visible: true })
      .first();
    const separator = page.locator('[data-slot="separator"]').first();
    const searchInput = page.getByRole("textbox", { name: "搜尋交易" });
    const filterGrid = page.locator("[data-entry-filter-grid]");

    await expect(accountLabel).toBeVisible();
    await expect(separator).toBeVisible();
    await expect(searchInput).toBeVisible();
    await expect(filterGrid).toBeVisible();

    const [accountBox, separatorBox, searchBox, filterGridBox] =
      await Promise.all([
        accountLabel.boundingBox(),
        separator.boundingBox(),
        searchInput.boundingBox(),
        filterGrid.boundingBox(),
      ]);
    expect(accountBox).not.toBeNull();
    expect(separatorBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(filterGridBox).not.toBeNull();
    expect(accountBox!.y).toBeLessThan(separatorBox!.y);
    expect(separatorBox!.y).toBeLessThan(searchBox!.y);
    expect(filterGridBox!.width).toBeCloseTo(separatorBox!.width, 0);
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/entries");
  await assertFilterOrder();

  await page.setViewportSize({ width: 390, height: 844 });
  await assertFilterOrder();
});

test("preserves transaction filters when returning from details", async ({
  page,
}) => {
  await page.goto(
    "/entries?q=%E4%BE%BF%E5%88%A9%E5%95%86%E5%BA%97&from=2026-07-01&to=2026-07-31&account=expense.restaurant",
  );

  await page
    .getByRole("link", {
      name: "全家便利商店 — 藍—成人加長不黏身雨衣",
      exact: true,
    })
    .click();
  await expect(page.getByRole("link", { name: "返回交易" })).toHaveAttribute(
    "href",
    "/entries?q=%E4%BE%BF%E5%88%A9%E5%95%86%E5%BA%97&from=2026-07-01&to=2026-07-31&account=expense.restaurant",
  );
  await page.getByRole("link", { name: "返回交易" }).click();

  await expect(page).toHaveURL(
    /\/entries\?q=%E4%BE%BF%E5%88%A9%E5%95%86%E5%BA%97&from=2026-07-01&to=2026-07-31&account=expense\.restaurant$/,
  );
  await expect(page.getByRole("textbox", { name: "搜尋交易" })).toHaveValue(
    "便利商店",
  );
  await expect(page.getByLabel("開始日期")).toHaveValue("2026-07-01");
  await expect(page.getByLabel("結束日期")).toHaveValue("2026-07-31");
  await expect(page.getByRole("radio", { name: "餐飲" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("revalidates fresh cached data when returning to a page", async ({
  page,
}) => {
  let externalDescription = entry.description;
  await page.route("http://localhost:8080/api/v1/entries**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/api/v1/entries" &&
      route.request().method() === "GET"
    ) {
      return route.fulfill({
        json: {
          items: [{ ...entry, description: externalDescription }],
          next_cursor: null,
        },
      });
    }
    await route.fallback();
  });

  await page.goto("/entries");
  await expect(
    page.getByRole("row").filter({ hasText: entry.description }),
  ).toBeVisible();

  await page.getByRole("link", { name: "帳戶", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  externalDescription = "由另一個 API 用戶端更新的交易";

  await page.getByRole("link", { name: "交易", exact: true }).click();
  await expect(page).toHaveURL(/\/entries$/);
  await expect(
    page.getByRole("row").filter({ hasText: externalDescription }),
  ).toBeVisible();
});

test("opens the balanced-postings editor without a mode switch", async ({
  page,
}) => {
  await page.goto("/entries/new");

  await expect(page.getByRole("heading", { name: "新增交易" })).toBeVisible();
  await expect(
    page.locator('[data-slot="dialog-content"][data-presentation="sheet"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('form[data-presentation="page"]').getByRole("tab"),
  ).toHaveCount(0);
  await expect(page.getByText("分錄明細", { exact: true })).toBeVisible();
  await expect(page.getByText("借方合計")).toBeVisible();
  await expect(page.getByRole("button", { name: "新增分錄" })).toBeVisible();

  await page.goto("/entries/01980000-0000-7000-8000-000000000010/edit");
  await expect(page.getByRole("heading", { name: "編輯交易" })).toBeVisible();
  await expect(
    page.locator('[data-slot="dialog-content"][data-presentation="sheet"]'),
  ).toHaveCount(0);
  await expect(page.getByLabel("交易說明")).toHaveValue(
    "全家便利商店 — 藍—成人加長不黏身雨衣",
  );
});

test("reviews a possible duplicate from the mobile transaction sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entries/new");

  await page.getByLabel("交易日期").fill("2026-07-24");
  await page.getByLabel("交易說明").fill("Email receipt");
  await fillBalancedPostings(page, "120");
  await page.getByRole("button", { name: "建立交易" }).click();

  const duplicateDialog = page.getByRole("alertdialog", {
    name: "可能重複的交易",
  });
  await expect(duplicateDialog).toBeVisible();
  await expect(
    duplicateDialog.getByText("全家便利商店 — 藍—成人加長不黏身雨衣"),
  ).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "取消" }).click();
  await expect(page.getByLabel("交易說明")).toHaveValue("Email receipt");

  await page.getByRole("button", { name: "建立交易" }).click();
  const repeatedDuplicateDialog = page.getByRole("alertdialog", {
    name: "可能重複的交易",
  });
  await repeatedDuplicateDialog
    .getByRole("button", { name: "仍要建立" })
    .click();

  await expect(page).toHaveURL(
    /\/entries\/01980000-0000-7000-8000-000000000020$/,
  );
  await expect(page.getByText("Email receipt")).toBeVisible();
});

test("opens create as a route-backed mobile sheet and protects dirty drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/entries");

  const entriesSearch = page.getByLabel("搜尋交易");
  const mobileNavigation = page.locator('nav[aria-label="主要導覽"]');
  const navigationBeforeOpen = await mobileNavigation.boundingBox();
  await page.getByLabel("新增交易").click();
  await expect(page).toHaveURL(/\/entries\/new$/);

  const sheet = page.getByRole("dialog", { name: "新增交易" });
  await expect(sheet).toBeVisible();
  await expect(entriesSearch).toBeAttached();
  await expect(sheet).toHaveAttribute("data-size", "near-full");
  await expect(sheet.locator('[data-slot="dialog-header"]')).toBeVisible();
  await expect(sheet.locator('[data-slot="dialog-body"]')).toBeVisible();
  await expect(sheet.locator('[data-slot="dialog-footer"]')).toBeVisible();
  const navigationWhileOpen = await mobileNavigation.boundingBox();
  expect(navigationBeforeOpen).not.toBeNull();
  expect(navigationWhileOpen).not.toBeNull();
  expect(navigationWhileOpen!.y).toBeCloseTo(navigationBeforeOpen!.y, 0);
  await expect(mobileNavigation).toHaveCSS("transform", "none");

  await expect
    .poll(async () => {
      const bounds = await sheet.boundingBox();
      return bounds ? bounds.y + bounds.height : null;
    })
    .toBeCloseTo(667, 0);
  const sheetGeometry = await sheet.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: bounds.top,
      width: bounds.width,
      borderTopLeftRadius: Number.parseFloat(style.borderTopLeftRadius),
    };
  });
  expect(sheetGeometry.top).toBeGreaterThan(0);
  expect(sheetGeometry.width).toBeCloseTo(390, 0);
  expect(sheetGeometry.borderTopLeftRadius).toBeGreaterThan(0);

  const sheetScroller = sheet.locator("[data-entry-editor-scroll]");
  await expect(sheetScroller).toHaveCSS("overflow-y", "auto");
  expect(
    await sheetScroller.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);

  await sheetScroller.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => sheetScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await page.getByLabel("交易說明").fill("保留這份草稿");
  await page.getByRole("button", { name: "關閉新增交易" }).click();

  const discardDialog = page.getByRole("alertdialog", {
    name: "捨棄這筆交易草稿？",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "繼續編輯" }).click();
  await expect(sheet).toBeVisible();
  await expect(page.getByLabel("交易說明")).toHaveValue("保留這份草稿");

  await page.evaluate(() => history.back());
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "捨棄變更" }).click();
  await expect(page).toHaveURL(/\/entries$/);
  await expect(sheet).not.toBeVisible();

  await page.goto("/entries/new");
  const directSheet = page.getByRole("dialog", { name: "新增交易" });
  await expect(directSheet).toBeVisible();
  await page.getByRole("button", { name: "關閉新增交易" }).click();
  await expect(page).toHaveURL(/\/entries$/);
  await expect(directSheet).not.toBeVisible();
});

test("hands a single drag from sheet scrolling to dismissal", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  await mockApi(page);

  try {
    await page.goto("/entries/new");

    const sheet = page.getByRole("dialog", { name: "新增交易" });
    const sheetScroller = sheet.locator("[data-entry-editor-scroll]");
    await expect(sheet).toBeVisible();
    await expect(sheetScroller).toHaveCSS("overflow-y", "auto");
    await expect(sheet).toHaveCSS("touch-action", "auto");
    await page.waitForTimeout(550);

    await sheetScroller.evaluate((element) => {
      element.scrollTop = 180;
    });
    const scrollerBounds = await sheetScroller.boundingBox();
    expect(scrollerBounds).not.toBeNull();
    const pointerX = Math.round(scrollerBounds!.x + scrollerBounds!.width / 2);
    const pointerY = Math.round(scrollerBounds!.y + 120);
    const client = await context.newCDPSession(page);
    const moveTouch = async (offset: number) => {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: pointerX, y: pointerY + offset }],
      });
      await page.waitForTimeout(16);
    };

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: pointerX, y: pointerY }],
    });
    for (const offset of [-20, -40, -80]) await moveTouch(offset);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => sheetScroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(180);
    await expect(sheet).not.toHaveAttribute("data-dragging", "true");
    await page.waitForTimeout(300);

    await sheetScroller.evaluate((element) => {
      element.scrollTop = 180;
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: pointerX, y: pointerY }],
    });
    for (const offset of [20, 40]) await moveTouch(offset);

    const partiallyScrolled = await sheetScroller.evaluate(
      (element) => element.scrollTop,
    );
    expect(partiallyScrolled).toBeGreaterThan(0);
    expect(partiallyScrolled).toBeLessThan(180);
    expect(
      await sheet.evaluate(
        (element) =>
          new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
      ),
    ).toBe(0);

    for (const offset of [60, 80, 120, 160, 220, 280, 340, 420]) {
      await moveTouch(offset);
    }

    await expect
      .poll(() => sheetScroller.evaluate((element) => element.scrollTop))
      .toBe(0);
    await expect(sheet).toHaveAttribute("data-dragging", "true");
    await expect
      .poll(() =>
        sheet.evaluate(
          (element) =>
            new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
        ),
      )
      .toBeGreaterThan(100);

    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page).toHaveURL(/\/entries$/);
    await expect(sheet).not.toBeVisible();

    await page.goto("/entries/new");
    const dirtySheet = page.getByRole("dialog", { name: "新增交易" });
    const dirtyScroller = dirtySheet.locator("[data-entry-editor-scroll]");
    await expect(dirtySheet).toBeVisible();
    await page.waitForTimeout(550);
    await page.getByLabel("交易說明").fill("保留這份草稿");
    const dirtyBounds = await dirtyScroller.boundingBox();
    expect(dirtyBounds).not.toBeNull();
    const dirtyX = Math.round(dirtyBounds!.x + dirtyBounds!.width / 2);
    const dirtyY = Math.round(dirtyBounds!.y + 120);

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: dirtyX, y: dirtyY }],
    });
    for (const offset of [40, 80, 140, 200, 280, 360]) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: dirtyX, y: dirtyY + offset }],
      });
      await page.waitForTimeout(16);
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    const discardDialog = page.getByRole("alertdialog", {
      name: "捨棄這筆交易草稿？",
    });
    await expect(discardDialog).toBeVisible();
    await expect(page).toHaveURL(/\/entries\/new$/);
    await discardDialog.getByRole("button", { name: "繼續編輯" }).click();
    await expect(discardDialog).not.toBeVisible();
    await expect(dirtySheet).toBeVisible();
    await expect(page.getByLabel("交易說明")).toHaveValue("保留這份草稿");
  } finally {
    await context.close();
  }
});

test("keeps a pending mobile transaction sheet fixed", async ({ page }) => {
  let releaseRequest = () => undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("http://localhost:8080/api/v1/entries", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await requestGate;
    return route.fulfill({
      status: 500,
      contentType: "application/problem+json",
      json: {
        title: "Internal Server Error",
        status: 500,
        detail: "delayed test response",
      },
    });
  });

  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/entries/new");
  const sheet = page.getByRole("dialog", { name: "新增交易" });
  await page.getByLabel("交易說明").fill("等待儲存");
  await fillBalancedPostings(page, "120");
  await page.getByRole("button", { name: "建立交易" }).click();
  await expect(page.getByRole("button", { name: "建立交易" })).toBeDisabled();

  await expect(sheet.locator('[data-slot="dialog-handle"]')).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "關閉新增交易" })).toHaveCount(
    0,
  );
  await dragMouse(page, sheet.locator('[data-slot="dialog-header"]'), 220);
  await expect(sheet).not.toHaveAttribute("data-dragging", "true");
  expect(
    await sheet.evaluate(
      (element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
    ),
  ).toBe(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();

  releaseRequest();
  await expect(page.getByRole("button", { name: "建立交易" })).toBeEnabled();
});

test("edits through the same route-backed mobile transaction sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/entries/01980000-0000-7000-8000-000000000010");

  const detailBackLink = page
    .locator('a[href="/entries"]')
    .filter({ hasText: "返回交易" });
  await page.getByRole("link", { name: "編輯" }).click();
  await expect(page).toHaveURL(
    /\/entries\/01980000-0000-7000-8000-000000000010\/edit$/,
  );

  const sheet = page.getByRole("dialog", { name: "編輯交易" });
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await sheet.boundingBox();
      return bounds ? bounds.y + bounds.height : null;
    })
    .toBeCloseTo(667, 0);
  await expect(detailBackLink).toBeAttached();
  await expect(sheet).toHaveAttribute("data-size", "near-full");
  await expect(sheet.locator("[data-entry-editor-scroll]")).toHaveCSS(
    "overflow-y",
    "auto",
  );
  await expect(page.getByLabel("交易說明")).toHaveValue(
    "全家便利商店 — 藍—成人加長不黏身雨衣",
  );

  await page.getByLabel("交易說明").fill("更新後的便利商店交易");
  await page.evaluate(() => history.back());

  const discardDialog = page.getByRole("alertdialog", {
    name: "捨棄未儲存的變更？",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "繼續編輯" }).click();
  await expect(page.getByLabel("交易說明")).toHaveValue("更新後的便利商店交易");

  await page.getByRole("button", { name: "儲存變更" }).click();
  await expect(page).toHaveURL(
    /\/entries\/01980000-0000-7000-8000-000000000010$/,
  );
  await expect(sheet).not.toBeVisible();
  await expect(page.getByText("更新後的便利商店交易")).toBeVisible();

  await page.getByRole("button", { name: "切換顯示模式" }).click();
  await page.getByRole("menuitem", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto(
    "/entries/01980000-0000-7000-8000-000000000010/edit?q=便利商店",
  );
  const directSheet = page.getByRole("dialog", { name: "編輯交易" });
  await expect(directSheet).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await directSheet.boundingBox();
      return bounds ? bounds.y + bounds.height : null;
    })
    .toBeCloseTo(667, 0);
  await page.getByRole("button", { name: "關閉編輯交易" }).click();
  await expect(page).toHaveURL(
    /\/entries\/01980000-0000-7000-8000-000000000010\?q=%E4%BE%BF%E5%88%A9%E5%95%86%E5%BA%97$/,
  );
  await expect(directSheet).not.toBeVisible();
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
  const deleteSheet = page.getByRole("alertdialog", {
    name: "刪除「現金」？",
  });
  await expect(deleteSheet).toBeVisible();
  await expect(deleteSheet).toHaveAttribute("data-presentation", "sheet");
  await expect(
    deleteSheet.locator('[data-slot="dialog-handle"]'),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(deleteSheet).not.toBeVisible();
  await expect(page.getByRole("button", { name: "刪除 現金" })).toBeVisible();

  await page.getByRole("button", { name: "刪除 現金" }).click();
  await page
    .locator('[data-slot="dialog-overlay"][data-presentation="sheet"]')
    .click({ position: { x: 20, y: 20 } });
  await expect(deleteSheet).not.toBeVisible();
  await expect(page.getByRole("button", { name: "刪除 現金" })).toBeVisible();

  await page.getByRole("button", { name: "刪除 現金" }).click();
  await dragMouse(
    page,
    deleteSheet.locator('[data-slot="dialog-handle"]'),
    120,
  );
  await expect(deleteSheet).not.toBeVisible();
  await expect(page.getByRole("button", { name: "刪除 現金" })).toBeVisible();

  await page.getByRole("button", { name: "刪除 現金" }).click();
  await deleteSheet.getByRole("button", { name: "確認刪除" }).click();
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

test("provides touch-sized controls and feedback on coarse pointers", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  await mockApi(page);

  const expectTouchTarget = async (locator: ReturnType<Page["locator"]>) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
  };

  const expectContainedTab = async (locator: ReturnType<Page["locator"]>) => {
    await expectTouchTarget(locator);
    const bounds = await locator.evaluate((element) => {
      const list = element.closest('[data-slot="tabs-list"]');
      if (!list) {
        return null;
      }

      const triggerBox = element.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        triggerTop: triggerBox.top,
        triggerRight: triggerBox.right,
        triggerBottom: triggerBox.bottom,
        triggerLeft: triggerBox.left,
        listTop: listBox.top,
        listRight: listBox.right,
        listBottom: listBox.bottom,
        listLeft: listBox.left,
      };
    });

    expect(bounds).not.toBeNull();
    expect(bounds!.triggerTop).toBeGreaterThanOrEqual(bounds!.listTop);
    expect(bounds!.triggerRight).toBeLessThanOrEqual(bounds!.listRight);
    expect(bounds!.triggerBottom).toBeLessThanOrEqual(bounds!.listBottom);
    expect(bounds!.triggerLeft).toBeGreaterThanOrEqual(bounds!.listLeft);
  };

  try {
    await page.goto("/entries");

    const search = page.getByLabel("搜尋交易");
    const accountSearch = page.getByRole("textbox", {
      name: "搜尋帳戶選項",
    });
    const allAccounts = page.getByRole("radio", { name: "所有帳戶" });
    const transaction = page.getByRole("link", {
      name: "查看 全家便利商店 — 藍—成人加長不黏身雨衣",
    });
    const mobileNavigation = page.getByRole("navigation", {
      name: "主要導覽",
    });

    await expectTouchTarget(search);
    await expectTouchTarget(accountSearch);
    await expectTouchTarget(allAccounts);
    await expectContainedTab(page.getByRole("tab", { name: "資產" }));
    await expectTouchTarget(
      mobileNavigation.getByRole("link", { name: "交易", exact: true }),
    );
    await expectTouchTarget(transaction);
    await expect(transaction).toHaveCSS("touch-action", "manipulation");
    await expectTouchTarget(page.getByRole("radio", { name: "現金" }));

    await page.goto("/entries/new");
    await expect(
      page.getByRole("dialog", { name: "新增交易" }).getByRole("tab"),
    ).toHaveCount(0);
    await expectTouchTarget(
      page.getByRole("combobox", { name: "帳戶" }).first(),
    );
    await expectTouchTarget(
      page.getByRole("combobox", { name: "方向" }).first(),
    );

    await page.setViewportSize({ width: 320, height: 844 });
    await expectTouchTarget(page.getByLabel("金額", { exact: true }).first());
    await expectTouchTarget(page.getByRole("button", { name: "新增分錄" }));
    await expectTouchTarget(
      page.getByRole("button", { name: "移除第 1 筆分錄" }),
    );
    const editorScroller = page.locator("[data-entry-editor-scroll]");
    expect(
      await editorScroller.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expectTouchTarget(page.getByRole("button", { name: "關閉新增交易" }));

    await page.goto("/accounts");
    await expectTouchTarget(page.getByRole("button", { name: "編輯 現金" }));

    const switchHitArea = await page
      .getByRole("switch", { name: "顯示已封存" })
      .evaluate((element) => {
        const style = getComputedStyle(element, "::after");
        return {
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height),
        };
      });
    expect(switchHitArea.width).toBeGreaterThanOrEqual(44);
    expect(switchHitArea.height).toBeGreaterThanOrEqual(44);
  } finally {
    await context.close();
  }
});

test("uses the shared calm motion curve across interaction families", async ({
  page,
}) => {
  const motionStyle = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        animationTimingFunction: style.animationTimingFunction,
        transitionDuration: style.transitionDuration,
        transitionTimingFunction: style.transitionTimingFunction,
      };
    });
  const calmCurve = "cubic-bezier(0.32, 0.72, 0, 1)";

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /測試使用者/ }).click();

  const dropdown = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(dropdown).toBeVisible();
  await expect
    .poll(() => motionStyle('[data-slot="dropdown-menu-content"]'))
    .toMatchObject({
      animationDuration: "0.26s",
      animationTimingFunction: calmCurve,
    });

  await page.keyboard.press("Escape");
  await expect(dropdown).not.toBeVisible();
  const sidebarGapMotion = await motionStyle('[data-slot="sidebar-gap"]');
  expect(sidebarGapMotion).toMatchObject({
    transitionDuration: "0.2s",
    transitionTimingFunction: calmCurve,
  });

  await page.goto("/accounts");
  await page
    .getByRole("row")
    .filter({ hasText: "現金" })
    .getByRole("button", { name: "編輯 現金" })
    .click();

  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => motionStyle('[data-slot="dialog-content"]'))
    .toMatchObject({
      animationDuration: "0.34s",
      animationTimingFunction: calmCurve,
    });
  await page.getByRole("button", { name: "取消" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entries");
  await page.getByLabel("新增交易").click();

  const drawer = page.locator(
    '[data-slot="dialog-content"][data-presentation="sheet"]',
  );
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      motionStyle('[data-slot="dialog-content"][data-presentation="sheet"]'),
    )
    .toMatchObject({
      animationDuration: "0.5s",
      animationTimingFunction: calmCurve,
    });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /測試使用者/ }).click();
  await expect
    .poll(() => motionStyle('[data-slot="dropdown-menu-content"]'))
    .toMatchObject({
      animationDuration: "0.001s",
    });
});

test("animates real route content without layering over the mobile editor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const trackedWindow = window as Window & {
      __balnNavigationAnimations: string[];
      __balnViewTransitionCount: number;
    };
    trackedWindow.__balnNavigationAnimations = [];
    trackedWindow.__balnViewTransitionCount = 0;

    document.addEventListener("animationstart", (event) => {
      if (
        event instanceof AnimationEvent &&
        event.target instanceof Element &&
        event.target.matches('[data-slot="app-route-content"]')
      ) {
        trackedWindow.__balnNavigationAnimations.push(event.animationName);
      }
    });

    if (typeof document.startViewTransition !== "function") return;
    const startViewTransition = document.startViewTransition.bind(document);
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: ((options) => {
        trackedWindow.__balnViewTransitionCount += 1;
        return startViewTransition(options);
      }) as typeof document.startViewTransition,
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const transitionCount = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            __balnViewTransitionCount: number;
          }
        ).__balnViewTransitionCount,
    );
  const navigationAnimations = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            __balnNavigationAnimations: string[];
          }
        ).__balnNavigationAnimations,
    );
  const resetNavigationAnimations = () =>
    page.evaluate(() => {
      (
        window as Window & {
          __balnNavigationAnimations: string[];
        }
      ).__balnNavigationAnimations = [];
    });

  const accountsNavigation = page.getByRole("link", {
    name: "帳戶",
    exact: true,
  });
  await expect(accountsNavigation).toHaveAttribute(
    "data-navigation-transition",
    "css",
  );
  const shellGeometry = () =>
    page.evaluate(() => {
      const bounds = (selector: string) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      };
      return {
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        header: bounds("header"),
        mobileNavigation: bounds('nav[aria-label="主要導覽"]'),
        scrollWidth: document.documentElement.scrollWidth,
        sidebar: bounds('[data-slot="sidebar"]'),
      };
    });
  const shellBeforeAnimation = await shellGeometry();
  await page.locator("html").evaluate((element) => {
    element.style.setProperty("--navigation-motion-duration", "1000ms");
  });
  await accountsNavigation.click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.locator('[data-slot="app-route-content"]')).toHaveAttribute(
    "data-entry-direction",
    "forward",
  );
  await expect
    .poll(navigationAnimations)
    .toContain("app-navigation-in-forward");
  const shellDuringAnimation = await shellGeometry();
  expect(shellDuringAnimation.scrollWidth).toBe(
    shellDuringAnimation.clientWidth,
  );
  expect(shellDuringAnimation.bodyScrollWidth).toBe(
    shellDuringAnimation.clientWidth,
  );
  expect(shellDuringAnimation.header).toEqual(shellBeforeAnimation.header);
  expect(shellDuringAnimation.sidebar).toEqual(shellBeforeAnimation.sidebar);
  await page.locator("html").evaluate((element) => {
    element.style.removeProperty("--navigation-motion-duration");
  });
  await expect.poll(transitionCount).toBe(0);
  await expect(page.locator('nav[aria-label="主要導覽"]')).toBeAttached();

  await resetNavigationAnimations();
  await page.getByRole("link", { name: "交易", exact: true }).click();
  await expect(page).toHaveURL(/\/entries$/);
  await expect.poll(navigationAnimations).toContain("app-navigation-in-back");

  await resetNavigationAnimations();
  await page
    .getByRole("link", {
      name: `查看 ${entry.description}`,
    })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/entries/${entry.id}$`));
  await expect
    .poll(navigationAnimations)
    .toContain("app-navigation-in-forward");

  await resetNavigationAnimations();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/entries$/);
  await expect(page.locator('[data-slot="app-route-content"]')).toHaveAttribute(
    "data-entry-direction",
    "back",
  );
  await expect.poll(navigationAnimations).toContain("app-navigation-in-back");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entries");
  await expect(
    page.getByRole("navigation", { name: "主要導覽" }),
  ).toBeVisible();
  const mobileShellBeforeAnimation = await shellGeometry();
  await page.locator("html").evaluate((element) => {
    element.style.setProperty("--navigation-motion-duration", "1000ms");
  });
  await resetNavigationAnimations();
  await page.getByRole("link", { name: "帳戶", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect
    .poll(navigationAnimations)
    .toContain("app-navigation-in-forward");
  const mobileShellDuringAnimation = await shellGeometry();
  expect(mobileShellDuringAnimation.scrollWidth).toBe(
    mobileShellDuringAnimation.clientWidth,
  );
  expect(mobileShellDuringAnimation.bodyScrollWidth).toBe(
    mobileShellDuringAnimation.clientWidth,
  );
  expect(mobileShellDuringAnimation.mobileNavigation).toEqual(
    mobileShellBeforeAnimation.mobileNavigation,
  );
  await page.locator("html").evaluate((element) => {
    element.style.removeProperty("--navigation-motion-duration");
  });

  await page.goto("/entries");
  await resetNavigationAnimations();
  await page.getByLabel("新增交易").click();
  await expect(page.getByRole("dialog", { name: "新增交易" })).toBeVisible();
  await expect.poll(navigationAnimations).toEqual([]);
  await expect.poll(transitionCount).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await resetNavigationAnimations();
  await page.getByRole("link", { name: "帳戶", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect.poll(navigationAnimations).toEqual([]);
});
