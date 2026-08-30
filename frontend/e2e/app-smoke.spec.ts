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

const budget = {
  id: "01980000-0000-7000-8000-000000000050",
  name: "日常開銷",
  amount_minor: 10_000,
  start_date: "2026-07-01",
  period_count: 1,
  period_unit: "month",
  rollover_mode: "accumulate",
  accounts: [accounts[0], accounts[1]],
  show_on_overview: true,
  overview_position: 0,
  as_of: "2026-07-24",
  period_from: "2026-07-01",
  period_to: "2026-08-01",
  carry_in_minor: 2_000,
  available_minor: 12_000,
  spent_minor: 7_000,
  remaining_minor: 5_000,
  status: "active",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

async function mockApi(page: Page) {
  let visibleAccounts = [...accounts];
  let visibleBudgets: Array<
    Omit<typeof budget, "overview_position"> & {
      overview_position: number | null;
    }
  > = [budget];
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
    if (path === "/api/v1/budgets" && method === "GET") {
      const overviewOnly = url.searchParams.get("overview_only") === "true";
      return route.fulfill({
        json: overviewOnly
          ? visibleBudgets.filter((item) => item.show_on_overview)
          : visibleBudgets,
      });
    }
    if (
      path.startsWith("/api/v1/budgets/") &&
      path.endsWith("/details") &&
      method === "GET"
    ) {
      const budgetId = path.split("/").at(-2);
      const current = visibleBudgets.find((item) => item.id === budgetId);
      if (!current) return route.fulfill({ status: 404, json: {} });

      const rawOffset = Number(url.searchParams.get("period_offset") ?? "0");
      const periodOffset = Number.isSafeInteger(rawOffset) ? rawOffset : 0;
      return route.fulfill({
        json: {
          budget: current,
          period_offset: periodOffset,
          period_kind: periodOffset < 0 ? "past" : "current",
          has_previous: true,
          has_next: periodOffset < 0,
          pace: {
            total_days: 31,
            elapsed_days: 24,
            remaining_days: 7,
            spent_through_as_of_minor: 7_000,
            future_spent_minor: 0,
            average_daily_spend_minor: 292,
            spendable_per_day_minor: 714,
          },
          trend: {
            bucket_days: 1,
            points: [
              {
                date_from: "2026-07-23",
                date_to: "2026-07-24",
                spent_minor: 6_880,
                remaining_minor: 5_120,
              },
              {
                date_from: "2026-07-24",
                date_to: "2026-07-25",
                spent_minor: 7_000,
                remaining_minor: 5_000,
              },
            ],
          },
        },
      });
    }
    if (
      path.startsWith("/api/v1/budgets/") &&
      path.endsWith("/days") &&
      method === "GET"
    ) {
      const budgetId = path.split("/").at(-2);
      const current = visibleBudgets.find((item) => item.id === budgetId);
      if (!current) return route.fulfill({ status: 404, json: {} });

      return route.fulfill({
        json: {
          items: [
            {
              date: "2026-07-23",
              spent_minor: 6_880,
              remaining_minor: 5_120,
              entry_count: 1,
              is_future: false,
            },
            {
              date: "2026-07-24",
              spent_minor: 120,
              remaining_minor: 5_000,
              entry_count: 1,
              is_future: false,
            },
            {
              date: "2026-07-25",
              spent_minor: 0,
              remaining_minor: 5_000,
              entry_count: 0,
              is_future: true,
            },
          ],
          next_cursor: null,
        },
      });
    }
    if (
      path.startsWith("/api/v1/budgets/") &&
      path.endsWith("/periods") &&
      method === "GET"
    ) {
      return route.fulfill({
        json: {
          items: [
            {
              period_offset: 0,
              period_from: "2026-07-01",
              period_to: "2026-08-01",
              period_kind: "current",
            },
            {
              period_offset: -1,
              period_from: "2026-06-01",
              period_to: "2026-07-01",
              period_kind: "past",
            },
          ],
          next_cursor: null,
        },
      });
    }
    if (
      path.startsWith("/api/v1/budgets/") &&
      path.endsWith("/statistics") &&
      method === "GET"
    ) {
      const periods = [
        {
          period_offset: -1,
          period_from: "2026-06-01",
          period_to: "2026-07-01",
          period_kind: "past",
          total_days: 30,
          elapsed_days: 30,
          carry_in_minor: 0,
          available_minor: 10_000,
          actual_spent_minor: 6_000,
          scheduled_spent_minor: 0,
          remaining_minor: 4_000,
          utilization_bps: 6_000,
          points: [
            {
              progress_bps: 0,
              date: "2026-06-01",
              actual_spent_minor: 0,
              scheduled_spent_minor: 0,
            },
            {
              progress_bps: 10_000,
              date: "2026-06-30",
              actual_spent_minor: 6_000,
              scheduled_spent_minor: 0,
            },
          ],
        },
        {
          period_offset: 0,
          period_from: "2026-07-01",
          period_to: "2026-08-01",
          period_kind: "current",
          total_days: 31,
          elapsed_days: 24,
          carry_in_minor: 2_000,
          available_minor: 12_000,
          actual_spent_minor: 7_000,
          scheduled_spent_minor: 500,
          remaining_minor: 4_500,
          utilization_bps: 6_250,
          points: [
            {
              progress_bps: 0,
              date: "2026-07-01",
              actual_spent_minor: 0,
              scheduled_spent_minor: 0,
            },
            {
              progress_bps: 7_742,
              date: "2026-07-24",
              actual_spent_minor: 7_000,
              scheduled_spent_minor: 0,
            },
            {
              progress_bps: 10_000,
              date: "2026-07-31",
              actual_spent_minor: 7_000,
              scheduled_spent_minor: 500,
            },
          ],
        },
      ];
      return route.fulfill({
        json: {
          from_offset: -1,
          to_offset: 0,
          period_count: 2,
          includes_current: true,
          summary: {
            total_actual_spent_minor: 13_000,
            total_scheduled_spent_minor: 500,
            average_daily_spend_minor: 240,
            average_utilization_bps: 6_125,
            utilization_spread_bps: 250,
            overspent_periods: 0,
          },
          periods,
        },
      });
    }
    if (path === "/api/v1/budgets" && method === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        amount_minor: number;
        start_date: string;
        period_count: number;
        period_unit: "day" | "week" | "month" | "year";
        rollover_mode: "accumulate" | "surplus_only" | "reset";
        account_keys: string[];
        show_on_overview: boolean;
      };
      const created = {
        ...budget,
        id: "01980000-0000-7000-8000-000000000051",
        ...body,
        accounts: accounts.filter((account) =>
          body.account_keys.includes(account.key),
        ),
        overview_position: body.show_on_overview ? visibleBudgets.length : null,
        amount_minor: body.amount_minor,
        available_minor: body.amount_minor,
        remaining_minor: body.amount_minor,
        spent_minor: 0,
        carry_in_minor: 0,
      };
      visibleBudgets = [...visibleBudgets, created];
      return route.fulfill({ status: 201, json: created });
    }
    if (path === "/api/v1/budgets/overview-order" && method === "PUT") {
      const body = route.request().postDataJSON() as { budget_ids: string[] };
      visibleBudgets = visibleBudgets.map((item) => ({
        ...item,
        overview_position: body.budget_ids.indexOf(item.id),
      }));
      return route.fulfill({ status: 204 });
    }
    if (path.startsWith("/api/v1/budgets/") && method === "PATCH") {
      const id = path.split("/").at(-1);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const current = visibleBudgets.find((item) => item.id === id)!;
      const updated = {
        ...current,
        ...body,
        overview_position:
          body.show_on_overview === false ? null : current.overview_position,
      };
      visibleBudgets = visibleBudgets.map((item) =>
        item.id === id ? updated : item,
      );
      return route.fulfill({ json: updated });
    }
    if (path.startsWith("/api/v1/budgets/") && method === "DELETE") {
      const id = path.split("/").at(-1);
      visibleBudgets = visibleBudgets.filter((item) => item.id !== id);
      return route.fulfill({ status: 204 });
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
      const budgetId = url.searchParams.get("budget_id");
      const matchesBudget =
        !budgetId || visibleBudgets.some((item) => item.id === budgetId);
      return route.fulfill({
        json: {
          items: matchesBudget ? [entry] : [],
          next_cursor: null,
        },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

async function fillBalancedPostings(page: Page, amount: string) {
  for (const [index, accountName] of ["餐飲", "現金"].entries()) {
    await page
      .getByRole("button", { name: `編輯第 ${index + 1} 筆分錄` })
      .click();
    const postingSheet = page.getByRole("dialog", {
      name: `編輯第 ${index + 1} 筆分錄`,
    });
    await postingSheet.getByRole("combobox", { name: "帳戶" }).click();
    await page.getByRole("option", { name: accountName }).click();
    await postingSheet.getByLabel("金額", { exact: true }).fill(amount);
    await postingSheet.getByRole("button", { name: "完成" }).click();
    await expect(postingSheet).not.toBeVisible();
  }
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

async function measureNextSheetEntrance(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ height: number; maxY: number }>((resolve) => {
        const observer = new MutationObserver(() => {
          const sheet = document.querySelector<HTMLElement>(
            '[data-slot="sheet-content"]',
          );
          if (!sheet) return;
          observer.disconnect();

          const startedAt = performance.now();
          const height = sheet.getBoundingClientRect().height;
          let maxY = 0;
          let frames = 0;

          const sample = () => {
            const transform = getComputedStyle(sheet).transform;
            const y = transform === "none" ? 0 : new DOMMatrix(transform).m42;
            maxY = Math.max(maxY, y);
            frames += 1;

            if (
              (maxY > 1 && y <= 1) ||
              (frames >= 12 && maxY <= 1) ||
              performance.now() - startedAt >= 1_500
            ) {
              resolve({ height, maxY });
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );
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

async function expectPressReleased(target: Locator) {
  const readState = () =>
    target.evaluate((element) => {
      const style = getComputedStyle(element);
      const transform =
        style.transform === "none"
          ? new DOMMatrix()
          : new DOMMatrix(style.transform);
      const independentScale = Number.parseFloat(style.scale);
      const scale = Number.isNaN(independentScale)
        ? transform.a
        : Math.min(transform.a, independentScale);
      return [Number.parseFloat(style.opacity), scale, transform.f].map(
        (value) => Math.round(value * 1_000) / 1_000,
      );
    });

  try {
    await expect.poll(readState).toEqual([1, 1, 0]);
  } catch {
    expect(await readState()).toEqual([1, 1, 0]);
  }
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("renders the authenticated dashboard on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
  );
  await expect(page.locator("html")).toHaveCSS("touch-action", "pan-x pan-y");
  await expect(page.locator("body")).toHaveCSS("touch-action", "pan-x pan-y");

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
  const month = page.getByRole("button", { name: "總覽月份" });
  await expect(month).toContainText(/\d{4} 年 \d{1,2} 月/);
  await month.click();
  const monthSheet = page.getByRole("dialog", { name: "總覽月份" });
  await expect(monthSheet).toBeFocused();
  await expect(monthSheet.getByLabel("總覽月份手動輸入")).not.toBeFocused();
  const august = monthSheet.getByRole("button", { name: "8 月" });
  await expect
    .poll(async () => {
      const box = await august.boundingBox();
      return box ? [box.width >= 44, box.height >= 44] : null;
    })
    .toEqual([true, true]);
  await august.click();
  await expect(month).toContainText(/\d{4} 年 8 月/);

  await page.getByRole("button", { name: "每月起始日" }).click();
  const startDaySheet = page.getByRole("dialog", { name: "每月起始日" });
  await expect(startDaySheet).toBeFocused();
  await expect(
    startDaySheet.getByLabel("每月起始日手動輸入"),
  ).not.toBeFocused();
  const day26 = startDaySheet.getByRole("button", { name: "26 日" });
  await expect
    .poll(async () => {
      const box = await day26.boundingBox();
      return box ? [box.width >= 44, box.height >= 44] : null;
    })
    .toEqual([true, true]);
  await day26.click();
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

test("supports direct desktop entry for overview period controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const month = page.getByRole("textbox", { name: "總覽月份" });
  await expect(month).toHaveValue(/\d{4}\/\d{2}/);
  await month.fill("202608");
  await month.press("Enter");
  await expect(month).toHaveValue("2026/08");

  const startDay = page.getByRole("textbox", { name: "每月起始日" });
  await startDay.fill("26");
  await startDay.press("Enter");
  await expect(startDay).toHaveValue("26");

  await page.getByRole("button", { name: "開啟總覽月份" }).click();
  await expect(page.getByRole("button", { name: "8 月" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "開啟每月起始日" }).click();
  await expect(page.getByRole("button", { name: "26 日" })).toBeVisible();
});

test("keeps mobile date pickers touch-first and commits ranges once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/entries");

  await page.getByRole("button", { name: "不限日期" }).click();
  const sheet = page.getByRole("dialog", { name: "篩選交易日期" });
  const from = sheet.getByLabel("開始日期");
  const to = sheet.getByLabel("結束日期");
  await expect(sheet).toBeFocused();
  await expect(from).not.toBeFocused();
  await expect(to).not.toBeFocused();

  const day = sheet.locator("[data-day]").first();
  const dayBox = await day.boundingBox();
  expect(dayBox).not.toBeNull();
  expect(dayBox!.width).toBeGreaterThanOrEqual(44);
  expect(dayBox!.height).toBeGreaterThanOrEqual(44);

  await from.fill("2026/07/01");
  await to.fill("2026/07/31");
  await expect(page).toHaveURL(/\/entries$/);
  await sheet.getByRole("button", { name: "套用" }).click();
  await expect(page).toHaveURL(/\/entries\?from=2026-07-01&to=2026-07-31$/);
});

test("keeps split budget balances on one line across card widths", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const amounts = page.locator("[data-budget-available-amount]");
    await expect
      .poll(() =>
        amounts.evaluateAll((elements) => {
          const element = elements.find(
            (candidate) => candidate.getClientRects().length > 0,
          );
          if (!element) return null;
          const childTops = [...element.children].map((child) =>
            Math.round(child.getBoundingClientRect().top),
          );
          return {
            fits: element.scrollWidth <= element.clientWidth + 1,
            singleLine: new Set(childTops).size <= 1,
            whiteSpace: getComputedStyle(element).whiteSpace,
          };
        }),
      )
      .toEqual({ fits: true, singleLine: true, whiteSpace: "nowrap" });
  }
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

test("checks for service worker updates from the profile menu", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return Boolean(registration.active);
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: /測試使用者/ }).click();
  await expect(page.getByRole("menuitem", { name: "檢查更新" })).toBeVisible();
  await page.getByRole("menuitem", { name: "檢查更新" }).click();
  await expect(page.getByText("Baln 已是最新版本")).toBeVisible();
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

test("opens and scrolls a mobile combobox picker without focusing search", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  await mockApi(page);

  try {
    await page.goto("/accounts");
    await page.getByRole("button", { name: "新增帳戶" }).click();

    const sheet = page.getByRole("dialog", { name: "新增帳戶" });
    const trigger = sheet.getByRole("combobox", { name: "帳戶類型" });
    const [entrance] = await Promise.all([
      measureNextSheetEntrance(page),
      trigger.click(),
    ]);
    expect(entrance.maxY).toBeGreaterThan(entrance.height * 0.8);

    const picker = page.getByRole("dialog", { name: "帳戶類型" });
    const search = picker.getByPlaceholder("搜尋帳戶類型…");
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute("data-presentation", "sheet");
    await expect(picker).toBeFocused();
    await expect(search).not.toBeFocused();

    const list = picker.locator('[data-slot="command-list"]');
    await expect(list).toBeVisible();
    await list.evaluate((element) => {
      element.style.maxHeight = "64px";
    });
    expect(
      await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);

    await dragTouch(page, list, -100);
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await search.click();
    await expect(search).toBeFocused();
    await picker.getByRole("button", { name: "關閉" }).click();
    await expect(picker).not.toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(trigger).toBeFocused();
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
  await expect(page.getByLabel("開始日期")).toHaveValue("2026/07/01");
  await expect(page.getByLabel("結束日期")).toHaveValue("2026/07/31");
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
  const createForm = page.locator('form[data-presentation="page"]');
  await expect(createForm.locator('[data-slot="card"]')).toHaveCount(0);
  await expect(
    createForm.getByRole("group", { name: "交易資料" }),
  ).toBeVisible();
  await expect(
    createForm.getByRole("group", { name: "分錄明細" }),
  ).toBeVisible();
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

  await page.getByLabel("交易日期").click();
  const dateSheet = page.getByRole("dialog", { name: "選擇交易日期" });
  const manualDate = dateSheet.getByLabel("選擇交易日期手動輸入");
  await expect(dateSheet).toBeFocused();
  await expect(manualDate).not.toBeFocused();
  await manualDate.fill("2026-07-24");
  await manualDate.press("Enter");
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
  await expect(sheet).toBeFocused();
  await expect(sheet.locator('form [data-slot="card"]')).toHaveCount(0);
  await expect(sheet.getByRole("group", { name: "交易資料" })).toBeVisible();
  await expect(sheet.getByRole("group", { name: "分錄明細" })).toBeVisible();
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
  await expect(sheet).toBeFocused();
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

  const firstPosting = directSheet.getByRole("button", {
    name: "編輯第 1 筆分錄",
  });
  await expect(firstPosting).toContainText("餐飲");
  await expect(firstPosting).toContainText("TWD 120");
  await firstPosting.click();
  const postingSheet = page.getByRole("dialog", {
    name: "編輯第 1 筆分錄",
  });
  await expect(postingSheet).toHaveAttribute("data-presentation", "sheet");
  await expect(postingSheet.getByLabel("金額")).toHaveValue("120");
  await postingSheet.getByRole("button", { name: "取消" }).click();
  await expect(postingSheet).not.toBeVisible();

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

test("manages budgets with the shared mobile sheet and touch navigation", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  await mockApi(page);

  try {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "總覽預算" })).toBeVisible();
    await expect(page.getByText("已使用").first()).toBeVisible();
    await expect(page.getByText("TWD 7,000").first()).toBeVisible();
    const track = page.locator(".budget-carousel-track");
    const slide = track.getByRole("article");
    const [trackBounds, slideBounds] = await Promise.all([
      track.boundingBox(),
      slide.boundingBox(),
    ]);
    expect(trackBounds).not.toBeNull();
    expect(slideBounds).not.toBeNull();
    expect(Math.abs(slideBounds!.width - trackBounds!.width)).toBeLessThan(1);
    expect(
      await track.evaluate(
        (element) => element.scrollWidth >= element.clientWidth,
      ),
    ).toBe(true);

    await page.getByRole("link", { name: "預算", exact: true }).click();
    await expect(page).toHaveURL(/\/budgets$/);
    const managedBudgetCard = page
      .locator('[data-slot="card"]:visible')
      .filter({ hasText: "日常開銷" });
    await expect(managedBudgetCard).toHaveCount(1);
    await expect(
      managedBudgetCard.locator('[data-slot="card-footer"]'),
    ).toBeVisible();
    await expect(
      managedBudgetCard.getByRole("link", { name: "查看預算：日常開銷" }),
    ).toBeVisible();
    await expect(
      managedBudgetCard.getByRole("button", { name: "編輯 日常開銷" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "新增預算" }).click();
    const sheet = page.getByRole("dialog", { name: "新增預算" });
    await expect(sheet).toHaveAttribute("data-presentation", "sheet");
    await expect(sheet).toHaveAttribute("data-size", "near-full");
    await expect(sheet).toBeFocused();
    await expect(sheet.locator('[data-slot="card"]')).toHaveCount(0);
    await expect(sheet.getByRole("group", { name: "預算資料" })).toBeVisible();
    await expect(
      sheet.getByRole("group", { name: "週期與餘額" }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("group", { name: "包含的帳戶" }),
    ).toBeVisible();
    await expect(sheet.locator('[data-slot="dialog-body"]')).toHaveCSS(
      "overflow-y",
      "auto",
    );
    await expect(
      sheet.getByRole("combobox", { name: "餘額沿襲方式" }),
    ).toContainText("累加餘額");
    await sheet.getByRole("combobox", { name: "餘額沿襲方式" }).click();
    await page.getByRole("option", { name: "只沿襲剩餘" }).click();
    await expect(sheet).toContainText(
      "只把未使用的餘額帶入下一期；超支不會延續。",
    );
    const budgetCheckbox = page.getByRole("checkbox", { name: /現金/ }).first();
    const checkboxBounds = await budgetCheckbox.boundingBox();
    expect(checkboxBounds).not.toBeNull();
    expect(Math.round(checkboxBounds!.width)).toBe(16);
    expect(Math.round(checkboxBounds!.height)).toBe(16);
    const checkboxHitArea = await budgetCheckbox.evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
      };
    });
    expect(checkboxHitArea.width).toBeGreaterThanOrEqual(44);
    expect(checkboxHitArea.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "儲存預算" }).click();
    await expect(page.getByText("請輸入預算名稱。")).toBeVisible();
    await expect(page.getByText("請輸入大於零的整數額度。")).toBeVisible();
    await expect(page.getByText("請至少選擇一個帳戶。")).toBeVisible();
    await expect(page.getByLabel("預算名稱")).toBeFocused();
    await page.getByLabel("預算名稱").fill("旅行基金");
    await page.getByLabel("每期額度").fill("5000");
    await page.getByRole("checkbox", { name: /現金/ }).check();
    await page.getByRole("button", { name: "儲存預算" }).click();
    await expect(sheet).not.toBeVisible();
    await expect(
      page
        .locator('[data-slot="card"]:visible')
        .filter({ hasText: "旅行基金" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "編輯 旅行基金" }).click();
    const editSheet = page.getByRole("dialog", { name: "編輯預算" });
    await expect(editSheet).toBeFocused();
    await page.getByLabel("每期額度").fill("6000");
    await page.getByRole("button", { name: "儲存預算" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "如何處理累計餘額？" }),
    ).toBeVisible();
    await expect(editSheet).not.toBeVisible();
    await page.getByRole("button", { name: "返回編輯" }).click();
    await expect(editSheet).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "捨棄未儲存的預算？" }),
    ).toBeVisible();
    await expect(editSheet).not.toBeVisible();
    await page.getByRole("button", { name: "繼續編輯" }).click();
    await expect(editSheet).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await page.getByRole("button", { name: "捨棄變更" }).click();
    await expect(editSheet).not.toBeVisible();

    await page.getByRole("button", { name: "更多導覽" }).click();
    await expect(page.getByRole("menuitem", { name: "帳戶" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "報表" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("opens budget detail, navigates periods, and drills into a filtered day responsively", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/budgets");
  await page.getByRole("link", { name: "查看預算：日常開銷" }).click();

  await expect(page).toHaveURL(`/budgets/${budget.id}`);
  await expect(
    page.getByText("日常開銷", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("可用額度", { exact: true })).toBeVisible();
  await expect(page.getByText("已使用與排程", { exact: true })).toBeVisible();
  await expect(page.getByText("支出步調", { exact: true })).toBeVisible();
  await expect(page.getByText("每日可用", { exact: true })).toBeVisible();
  await expect(page.getByText("目前日均支出", { exact: true })).toBeVisible();
  await expect(page.getByText("每日明細", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-budget-day-row="mobile"]').first(),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const rootWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body?.scrollWidth ?? 0;
        return Math.max(rootWidth, bodyWidth) <= window.innerWidth + 1;
      }),
    )
    .toBe(true);

  await page.getByRole("tab", { name: "跨期" }).click();
  await expect(page).toHaveURL(
    `/budgets/${budget.id}?view=statistics&from=-1&to=0`,
  );
  await expect(page.getByText("跨期總支出", { exact: true })).toBeVisible();
  await expect(
    page.getByText("各期支出與使用率", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("每期剩餘與超支", { exact: true })).toBeVisible();
  await expect(page.getByText("期內累積走勢", { exact: true })).toBeVisible();
  await expect(page.getByLabel("正規化期內累積使用率趨勢圖")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rootWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body?.scrollWidth ?? 0;
        return Math.max(rootWidth, bodyWidth) <= window.innerWidth + 1;
      }),
    )
    .toBe(true);

  await page.getByRole("tab", { name: "單期" }).click();
  await expect(page).toHaveURL(`/budgets/${budget.id}`);

  const previousPeriod = page.getByRole("link", {
    name: "查看上一期預算",
  });
  await expect(previousPeriod).toBeVisible();
  await expect(previousPeriod).toHaveAttribute(
    "href",
    `/budgets/${budget.id}?period=-1`,
  );
  await expect(page.getByRole("button", { name: "下一期" })).toBeDisabled();
  await previousPeriod.click();
  await expect(page).toHaveURL(`/budgets/${budget.id}?period=-1`);
  await expect(page.getByText("第 1 個前期", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "查看下一期預算" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.locator('[data-budget-day-row="desktop"]').first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });

  const dayLink = page
    .locator('[data-budget-day-row="mobile"]')
    .filter({ hasText: "2026/07/24" });
  await expect(dayLink).toBeVisible();
  await dayLink.click();
  await expect(page).toHaveURL(
    `/entries?from=2026-07-24&to=2026-07-24&budget=${budget.id}`,
  );
  await expect(
    page.getByRole("radiogroup", { name: "所有預算" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "日常開銷" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByText(entry.description, { exact: true }).first(),
  ).toBeVisible();
});

test("keeps the budget dialog within the desktop viewport", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 800 },
  });
  const page = await context.newPage();
  await mockApi(page);

  try {
    await page.goto("/budgets");
    await page.getByRole("button", { name: "新增預算" }).click();
    const desktopDialog = page.getByRole("dialog", { name: "新增預算" });
    await expect(desktopDialog).toHaveAttribute("data-presentation", "dialog");
    await expect(desktopDialog).toBeVisible();
    await expect(desktopDialog).toBeFocused();
    await expect(desktopDialog.locator('[data-slot="card"]')).toHaveCount(0);

    const viewport = page.viewportSize();
    const desktopBounds = await desktopDialog.boundingBox();
    expect(viewport).not.toBeNull();
    expect(desktopBounds).not.toBeNull();
    expect(desktopBounds!.x).toBeGreaterThanOrEqual(0);
    expect(desktopBounds!.y).toBeGreaterThanOrEqual(0);
    expect(desktopBounds!.x + desktopBounds!.width).toBeLessThanOrEqual(
      viewport!.width,
    );
    expect(desktopBounds!.y + desktopBounds!.height).toBeLessThanOrEqual(
      viewport!.height,
    );

    const desktopHeader = desktopDialog.locator('[data-slot="dialog-header"]');
    const desktopBody = desktopDialog.locator('[data-slot="dialog-body"]');
    const desktopFooter = desktopDialog.locator('[data-slot="dialog-footer"]');
    await expect(desktopHeader).toBeVisible();
    await expect(desktopBody).toHaveCSS("overflow-y", "auto");
    await expect(desktopFooter).toBeVisible();

    const [desktopHeaderBounds, desktopBodyBounds, desktopFooterBounds] =
      await Promise.all([
        desktopHeader.boundingBox(),
        desktopBody.boundingBox(),
        desktopFooter.boundingBox(),
      ]);
    expect(desktopHeaderBounds).not.toBeNull();
    expect(desktopBodyBounds).not.toBeNull();
    expect(desktopFooterBounds).not.toBeNull();
    expect(desktopHeaderBounds!.y).toBeGreaterThanOrEqual(0);
    expect(
      desktopFooterBounds!.y + desktopFooterBounds!.height,
    ).toBeLessThanOrEqual(viewport!.height);
    expect(
      desktopHeaderBounds!.y + desktopHeaderBounds!.height,
    ).toBeLessThanOrEqual(desktopBodyBounds!.y);
    expect(
      desktopBodyBounds!.y + desktopBodyBounds!.height,
    ).toBeLessThanOrEqual(desktopFooterBounds!.y);

    const accountRow = desktopDialog
      .locator("label")
      .filter({ hasText: "現金" })
      .first();
    const accountNameBounds = await accountRow
      .locator("span")
      .filter({ hasText: /^現金$/ })
      .boundingBox();
    const accountKeyBounds = await accountRow
      .locator("span")
      .filter({ hasText: /^asset\.cash$/ })
      .boundingBox();
    expect(accountNameBounds).not.toBeNull();
    expect(accountKeyBounds).not.toBeNull();
    expect(accountNameBounds!.x + accountNameBounds!.width).toBeLessThanOrEqual(
      accountKeyBounds!.x,
    );
    await desktopDialog.getByRole("button", { name: "取消" }).click();
  } finally {
    await context.close();
  }
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
    await search.tap();
    await expect(page.locator("html")).toHaveAttribute(
      "data-input-modality",
      "pointer",
    );
    await expect(search).toHaveCSS("box-shadow", "none");
    await page.keyboard.press("Tab");
    await expect(page.locator("html")).toHaveAttribute(
      "data-input-modality",
      "keyboard",
    );
    await expect
      .poll(() =>
        page
          .locator(":focus")
          .evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .not.toBe("none");
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
    await page.setViewportSize({ width: 320, height: 844 });
    const firstPosting = page.getByRole("button", {
      name: "編輯第 1 筆分錄",
    });
    await expectTouchTarget(firstPosting);
    await firstPosting.click();

    const postingSheet = page.getByRole("dialog", {
      name: "編輯第 1 筆分錄",
    });
    await expectTouchTarget(
      postingSheet.getByRole("combobox", { name: "帳戶" }),
    );
    await expectTouchTarget(
      postingSheet.getByRole("combobox", { name: "方向" }),
    );
    await expectTouchTarget(postingSheet.getByLabel("金額", { exact: true }));
    await expectTouchTarget(
      postingSheet.getByRole("button", { name: "移除第 1 筆分錄" }),
    );
    await postingSheet.getByRole("button", { name: "取消" }).click();
    await expect(postingSheet).not.toBeVisible();

    await expectTouchTarget(page.getByRole("button", { name: "新增分錄" }));
    const editorScroller = page.locator("[data-entry-editor-scroll]");
    expect(
      await editorScroller.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expectTouchTarget(page.getByRole("button", { name: "關閉新增交易" }));

    await page.goto("/accounts");
    await expectTouchTarget(page.getByRole("button", { name: "編輯 現金" }));

    const archivedSwitch = page.getByRole("switch", { name: "顯示已封存" });
    const switchBounds = await archivedSwitch.boundingBox();
    expect(switchBounds).not.toBeNull();
    expect(Math.round(switchBounds!.width)).toBe(44);
    expect(Math.round(switchBounds!.height)).toBe(20);

    const thumbBounds = await archivedSwitch
      .locator('[data-slot="switch-thumb"]')
      .boundingBox();
    expect(thumbBounds).not.toBeNull();
    expect(thumbBounds!.x).toBeGreaterThanOrEqual(switchBounds!.x);
    expect(thumbBounds!.x + thumbBounds!.width).toBeLessThanOrEqual(
      switchBounds!.x + switchBounds!.width,
    );

    const switchHitArea = await archivedSwitch.evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
      };
    });
    expect(switchHitArea.width).toBeGreaterThanOrEqual(44);
    expect(switchHitArea.height).toBeGreaterThanOrEqual(44);

    await page.getByText("顯示已封存", { exact: true }).click();
    await expect(archivedSwitch).toBeChecked();
    const checkedThumbBounds = await archivedSwitch
      .locator('[data-slot="switch-thumb"]')
      .boundingBox();
    expect(checkedThumbBounds).not.toBeNull();
    expect(
      checkedThumbBounds!.x + checkedThumbBounds!.width,
    ).toBeLessThanOrEqual(switchBounds!.x + switchBounds!.width);
  } finally {
    await context.close();
  }
});

test("uses Motion for finite interaction feedback across interaction families", async ({
  page,
}) => {
  const cssAnimationStyle = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        transitionDuration: style.transitionDuration,
      };
    });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const pressTarget = page.getByRole("button", { name: "Toggle Sidebar" });
  await pressTarget.dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerType: "touch",
  });
  await expect(pressTarget).toHaveAttribute("data-pressed", "true");
  await expect
    .poll(() =>
      pressTarget.evaluate((element) => {
        const style = getComputedStyle(element);
        const transformScale =
          style.transform === "none" ? 1 : new DOMMatrix(style.transform).a;
        const independentScale = Number.parseFloat(style.scale);
        return Number.isNaN(independentScale)
          ? transformScale
          : Math.min(transformScale, independentScale);
      }),
    )
    .toBeLessThan(0.99);
  await pressTarget.dispatchEvent("pointerup", {
    button: 0,
    isPrimary: true,
    pointerType: "touch",
  });
  await page.getByRole("button", { name: /測試使用者/ }).click();

  const dropdown = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(dropdown).toBeVisible();
  expect(
    await cssAnimationStyle('[data-slot="dropdown-menu-content"]'),
  ).toEqual({ animationName: "none", transitionDuration: "0s" });

  await page.keyboard.press("Escape");
  await expect(dropdown).not.toBeVisible();
  expect(await cssAnimationStyle('[data-slot="sidebar-gap"]')).toEqual({
    animationName: "none",
    transitionDuration: "0s",
  });

  await page.goto("/accounts");
  await page
    .getByRole("row")
    .filter({ hasText: "現金" })
    .getByRole("button", { name: "編輯 現金" })
    .click();

  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  expect(await cssAnimationStyle('[data-slot="dialog-content"]')).toEqual({
    animationName: "none",
    transitionDuration: "0s",
  });
  await page.getByRole("button", { name: "取消" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entries");
  await page.getByLabel("新增交易").click();

  const drawer = page.locator(
    '[data-slot="dialog-content"][data-presentation="sheet"]',
  );
  await expect(drawer).toBeVisible();
  expect(
    await cssAnimationStyle(
      '[data-slot="dialog-content"][data-presentation="sheet"]',
    ),
  ).toEqual({ animationName: "none", transitionDuration: "0s" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /測試使用者/ }).click();
  await expect(
    page.locator('[data-slot="dropdown-menu-content"]'),
  ).toBeVisible();
  expect(
    await cssAnimationStyle('[data-slot="dropdown-menu-content"]'),
  ).toEqual({ animationName: "none", transitionDuration: "0s" });
});

test("releases composed press feedback after navigation and opening overlays", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const accountNavigation = page.getByRole("link", {
    name: "帳戶",
    exact: true,
  });
  await accountNavigation.click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expectPressReleased(accountNavigation);

  await page.mouse.move(800, 400);
  await expect(accountNavigation).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(
    await accountNavigation.evaluate((element) => ({
      active: element.matches(":active"),
      focusVisible: element.matches(":focus-visible"),
      hover: element.matches(":hover"),
    })),
  ).toEqual({ active: false, focusVisible: false, hover: false });
  const sidebarSelection = accountNavigation.locator(
    '[data-slot="active-navigation-indicator"]',
  );
  await expect
    .poll(async () => {
      const [selectionBounds, linkBounds] = await Promise.all([
        sidebarSelection.boundingBox(),
        accountNavigation.boundingBox(),
      ]);
      if (!selectionBounds || !linkBounds) return false;
      return (
        Math.abs(selectionBounds.x - linkBounds.x) <= 1 &&
        Math.abs(selectionBounds.y - linkBounds.y) <= 1 &&
        Math.abs(selectionBounds.width - linkBounds.width) <= 1 &&
        Math.abs(selectionBounds.height - linkBounds.height) <= 1
      );
    })
    .toBe(true);
  expect(
    await sidebarSelection.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe("rgba(0, 0, 0, 0)");

  const createEntry = page.getByRole("link", { name: "新增交易" });
  await createEntry.click();
  await expect(page).toHaveURL(/\/entries\/new$/);
  await expectPressReleased(createEntry);

  await page.goto("/");
  const userMenu = page
    .locator('[data-slot="dropdown-menu-trigger"]')
    .filter({ hasText: "測試使用者" });
  await userMenu.click();
  await expect(
    page.locator('[data-slot="dropdown-menu-content"]'),
  ).toBeVisible();
  await expectPressReleased(userMenu);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const periodStart = page.getByRole("button", { name: "每月起始日" });
  await periodStart.click();
  await expect(page.getByRole("button", { name: "26 日" })).toBeVisible();
  await expectPressReleased(periodStart);
});

test("animates route content with Motion without layering over the mobile editor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const trackedWindow = window as Window & {
      __balnViewTransitionCount: number;
    };
    trackedWindow.__balnViewTransitionCount = 0;

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
  const currentRoute = page.locator(
    '[data-slot="app-route-content"]:not([aria-hidden="true"])',
  );

  const accountsNavigation = page.getByRole("link", {
    name: "帳戶",
    exact: true,
  });
  await expect(accountsNavigation).toHaveAttribute(
    "data-navigation-transition",
    "motion",
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
  await accountsNavigation.click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { name: "帳戶" })).toHaveAttribute(
    "data-navigation-direction",
    "forward",
  );
  await expect(currentRoute).toContainText("帳戶");
  expect(
    await currentRoute.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe("none");
  const shellDuringAnimation = await shellGeometry();
  expect(shellDuringAnimation.scrollWidth).toBe(
    shellDuringAnimation.clientWidth,
  );
  expect(shellDuringAnimation.bodyScrollWidth).toBe(
    shellDuringAnimation.clientWidth,
  );
  expect(shellDuringAnimation.header).toEqual(shellBeforeAnimation.header);
  expect(shellDuringAnimation.sidebar).toEqual(shellBeforeAnimation.sidebar);
  await expect.poll(transitionCount).toBe(0);
  await expect(page.locator('nav[aria-label="主要導覽"]')).toBeAttached();

  await page.getByRole("link", { name: "交易", exact: true }).click();
  await expect(page).toHaveURL(/\/entries$/);
  await expect(page.getByRole("heading", { name: "交易" })).toHaveAttribute(
    "data-navigation-direction",
    "back",
  );
  await expect(currentRoute).toContainText("交易");

  await page
    .getByRole("link", {
      name: `查看 ${entry.description}`,
    })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/entries/${entry.id}$`));
  await expect(currentRoute).toContainText(entry.description);

  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/entries$/);
  await expect(currentRoute).toContainText("交易");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/entries");
  await expect(
    page.getByRole("navigation", { name: "主要導覽" }),
  ).toBeVisible();
  const mobileShellBeforeAnimation = await shellGeometry();
  await page.getByRole("button", { name: "更多導覽" }).click();
  await page.getByRole("menuitem", { name: "帳戶" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(currentRoute).toContainText("帳戶");
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
  await page.goto("/entries");
  await page.getByLabel("新增交易").click();
  await expect(page.getByRole("dialog", { name: "新增交易" })).toBeVisible();
  await expect(currentRoute).not.toHaveAttribute("data-entry-direction");
  await expect.poll(transitionCount).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "更多導覽" }).click();
  await page.getByRole("menuitem", { name: "帳戶" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(currentRoute).toContainText("帳戶");
});
