# Personal Finance Ledger Data Structure Specification

## 1. 文件資訊

* 文件名稱：Personal Finance Ledger Data Structure Specification
* 版本：v1.0
* 狀態：Draft
* 適用範圍：個人記帳系統
* 預設幣別：TWD
* 核心模型：Double-entry bookkeeping
* 主要使用者：個人使用者、AI Agent、應用程式後端

---

## 2. 設計目標

本系統的核心目標是建立一個：

* 適合個人日常記帳
* 對 AI Agent 容錯性高
* 可以正確處理現金、銀行帳戶、信用卡與轉帳
* 能避免重複計算信用卡繳款
* 支援拆分消費
* 易於搜尋、修改與擴充
* 不依賴脆弱的跨表名稱與人工關聯

的財務資料模型。

---

## 3. Name-like Field Convention

本節定義所有容易被誤認為「名稱」的欄位。Agent 必須先判斷欄位的語意，再決定是否可以用來查詢、顯示或精確寫入。

### 3.1 欄位分類

| 欄位 | 分類 | Convention | Agent 使用規則 |
| --- | --- | --- | --- |
| `id`、`entry_id`、`account_id` | 永久識別碼 | UUID opaque value；不得自行解析、產生可讀語意或替換 | 只用於資料關聯與精確更新；不可當作顯示文字 |
| `accounts.key`、API 的 `account_key` | 穩定程式識別碼 | ASCII 小寫；以 `.` 分隔階層；每個 segment 使用 `snake_case`；格式為 `{type}.{identifier}` 或 `{type}.{group}.{identifier}` | 精確指定 Account 時優先使用；不得因顯示名稱改變而自動修改，只有使用者明確要求時才能連同 `type` 安全變更 |
| `accounts.name` | 顯示名稱 | 可使用中文及其他 Unicode；供人閱讀；應簡短清楚；允許修改；不要求唯一 | 可顯示與模糊搜尋；不可作為唯一識別、外部關聯或精確寫入依據 |
| `entries.description` | 事件標題／主要搜尋文字 | 人類可讀的單行文字；可包含商家、用途與必要上下文；不要求固定格式或唯一 | 用於顯示與全文搜尋；不可當作 dedup key 或穩定識別碼 |
| `entries.note`、`postings.memo` | 自由文字 | 可使用自然語言與 Unicode；補充上下文；可為 `null`；不得承載需要程式解析的結構 | 只作補充顯示與搜尋；不可依賴其內容建立關聯或判斷唯一性 |
| `entries.dedup_key` | 冪等／去重識別碼 | 機器產生的穩定 token；建議使用 `<namespace>:<opaque-token>`，namespace 使用小寫 ASCII；不得放人類可讀描述 | 相同來源事件重試時必須重用；不可由 `description`、日期或金額推導 |
| `type` | 固定列舉 token | 使用規格中定義的小寫 ASCII 值；不可自行加入同義詞或翻譯 | 只能使用允許值；顯示給使用者時另行轉換成顯示文字 |
| `operation` | API 操作 token | 使用規格中定義的小寫 ASCII snake_case 值，例如 `create_entry`、`update_entry` | 僅作 API 路由／操作判斷；不可當作資料名稱或顯示文字 |

### 3.2 通用規則

1. 程式識別碼、顯示文字、自由文字與去重 token 不可互相替代。
2. 除非欄位明確標示為 identifier，任何 `name`、`description`、`note` 或 `memo` 都不得被視為唯一值。
3. 除非欄位明確標示為 display text，Agent 不得把使用者看到的名稱回填到 `key`、`id` 或 `dedup_key`。
4. 顯示文字的語言、大小寫與空白應保留原意；不要為了符合 machine-key 規則而轉換 `name`、`description`、`note` 或 `memo`。
5. 跨表或跨請求引用 Account 時使用 `account_id` 或 `account_key`，不可使用 `account.name`。
6. `account_key` 是 API 對 `accounts.key` 的引用名稱，兩者必須使用完全相同的值與比對規則。
7. Entry 與 Posting 以 `account_id` 關聯 Account。明確變更 Account key 或 type 後，所有歷史查詢會透過該關聯立即顯示新值；舊 key 不保留 alias，也不可再用於精確查詢或寫入。

核心資料結構只包含：

1. `accounts`
2. `entries`
3. `postings`

系統不在核心層建模商家、月份、預算、收據、標籤或 recurring transaction。

---

## 4. 核心概念

### 4.1 Account

Account 代表一個財務帳戶或收支分類。

Account 可以是：

* 資產帳戶，例如現金、銀行帳戶
* 負債帳戶，例如信用卡
* 收入分類，例如薪資
* 支出分類，例如餐飲
* 權益帳戶，例如期初餘額

---

### 4.2 Entry

Entry 代表一筆使用者認知上的完整財務事件。

例如：

* 麥當勞早餐
* 七月份薪資
* 繳交信用卡帳單
* 從玉山銀行轉帳到現金
* 超商購買食物與日用品

Entry 保存事件本身的資訊，例如：

* 日期
* 說明
* 備註

Entry 不直接保存金額、付款帳戶或分類。

---

### 4.3 Posting

Posting 代表一筆 Entry 對某個 Account 造成的財務影響。

每筆 Entry 必須包含至少兩個 Posting。

同一筆 Entry 中的所有 Posting 金額加總必須為零。

```text
SUM(postings.amount_minor) = 0
```

---

## 5. 資料關係

```text
accounts
   ↑
postings
   ↓
entries
```

關聯關係：

```text
Entry 1 ─── N Postings
Account 1 ─── N Postings
```

Posting 不可獨立存在。

每個 Posting 必須同時關聯：

* 一個 Entry
* 一個 Account

---

# 6. Accounts Schema

## 6.1 Table: `accounts`

| 欄位           | 型別        | 必填 | 說明                  |
| ------------ | --------- | -: | ------------------- |
| `id`         | UUID      |  是 | Account 的永久識別碼      |
| `key`        | VARCHAR   |  是 | 給程式與 Agent 使用的穩定識別碼 |
| `name`       | VARCHAR   |  是 | 顯示名稱                |
| `type`       | ENUM      |  是 | Account 類型          |
| `archived`   | BOOLEAN   |  是 | 是否已停用               |
| `created_at` | TIMESTAMP |  是 | 建立時間                |
| `updated_at` | TIMESTAMP |  是 | 最後更新時間              |

---

## 6.2 Account Type

`type` 只能是以下其中之一：

```text
asset
liability
income
expense
equity
```

### `asset`

代表使用者擁有的資產。

例如：

```text
asset.cash
asset.bank.esun
asset.bank.cathay
asset.wallet.line_pay
```

### `liability`

代表使用者負有的債務。

例如：

```text
liability.card.cathay
liability.card.esun
liability.loan.personal
```

### `income`

代表收入來源分類。

例如：

```text
income.salary
income.refund
income.interest
income.other
```

### `expense`

代表支出分類。

例如：

```text
expense.restaurant
expense.groceries
expense.transport
expense.rent
expense.subscriptions
expense.household
expense.uncategorized
```

### `equity`

代表系統建立初始財務狀態時使用的權益帳戶。

例如：

```text
equity.opening_balance
```

一般使用者介面可以隱藏 equity account。

---

## 6.3 Account Key 規則

`key` 是供程式與 Agent 使用的穩定值。

格式：

```text
{type}.{identifier}
```

或：

```text
{type}.{group}.{identifier}
```

例如：

```text
asset.cash
asset.bank.esun
liability.card.cathay
expense.restaurant
income.salary
```

規則：

* 必須唯一
* 建立後原則上不修改
* 不依賴顯示名稱
* 只使用 ASCII 小寫英文字母、數字、底線與句點
* 使用句點表示階層
* 每個階層 segment 使用 `snake_case`
* 不使用空白
* 不使用使用者可自由變更的名稱

`name` 可以修改，但 `key` 應保持穩定。

---

## 6.4 Account Constraints

```text
PRIMARY KEY (id)
UNIQUE (key)
NOT NULL (name)
NOT NULL (type)
NOT NULL (archived)
```

若 Account 已被 Posting 引用，不可直接刪除。

應改為：

```text
archived = true
```

---

# 7. Entries Schema

## 7.1 Table: `entries`

| 欄位            | 型別        | 必填 | 說明           |
| ------------- | --------- | -: | ------------ |
| `id`          | UUID      |  是 | Entry 的永久識別碼 |
| `date`        | DATE      |  是 | 此財務事件的歸屬日期   |
| `description` | TEXT      |  是 | 主要可搜尋文字      |
| `note`        | TEXT      |  否 | 額外備註         |
| `dedup_key`   | VARCHAR   |  否 | 防止重複建立交易     |
| `created_at`  | TIMESTAMP |  是 | 建立時間         |
| `updated_at`  | TIMESTAMP |  是 | 最後修改時間       |

---

## 7.2 Entry Date

`date` 代表使用者認為這筆交易所屬的日期。

第一版不區分：

* transaction date
* posting date
* settlement date
* accounting period

月份、年份與報表期間都應由 `date` 推導。

例如：

```text
date = 2026-07-24
month = 2026-07
year = 2026
```

系統不建立獨立的 Month Classification。

---

## 7.3 Description

`description` 是主要的人類可讀與全文搜尋欄位。

建議內容：

```text
麥當勞 早餐
OpenAI ChatGPT 訂閱
七月份薪資
全聯 食材與日用品
玉山銀行轉帳至現金
```

商家名稱不建立獨立 entity。

商家、商品或用途都可以直接寫入 `description` 或 `note`，再使用全文搜尋。

---

## 7.4 Deduplication Key

`dedup_key` 用於避免 Agent、同步器或匯入程序重複建立同一筆 Entry。

範例：

```text
manual-message:019abc
gmail-message:18f92abc
receipt-sha256:a2d4...
bank-import:esun:20260724:12345
```

規則：

* 可以為空
* 若存在，必須唯一
* 相同操作重試時應使用相同 `dedup_key`
* 不應使用描述、日期與金額拼接作為唯一防重機制

`dedup_key` 只處理同一來源操作的重試。建立 Entry 時，Service 另以 `date` 與
依 Account 彙總後的 signed Posting 金額檢查可能重複的既有 Entry；description、
note、memo 與 Posting 順序不參與比對。若命中，呼叫端必須先讓使用者確認這是另一
筆交易，再以 `confirmed_distinct = true` 重試。這個確認機制適用於 Web、API 與
Agent，不能取代穩定的來源 `dedup_key`。

---

## 7.5 Entry Constraints

```text
PRIMARY KEY (id)
NOT NULL (date)
NOT NULL (description)
UNIQUE (dedup_key) WHERE dedup_key IS NOT NULL
```

Entry 必須和至少兩個 Posting 在同一個 database transaction 中建立。

不得先單獨建立空 Entry，再由 Agent 分次補 Posting。

---

# 8. Postings Schema

## 8.1 Table: `postings`

| 欄位             | 型別        | 必填 | 說明              |
| -------------- | --------- | -: | --------------- |
| `id`           | UUID      |  是 | Posting 的永久識別碼  |
| `entry_id`     | UUID      |  是 | 所屬 Entry        |
| `account_id`   | UUID      |  是 | 影響的 Account     |
| `amount_minor` | BIGINT    |  是 | 帶正負號的整數金額       |
| `memo`         | TEXT      |  否 | 此 Posting 的補充資訊 |
| `created_at`   | TIMESTAMP |  是 | 建立時間            |

---

## 8.2 Amount Sign Convention

本系統使用 signed amount。

```text
正數 = Debit
負數 = Credit
```

所有 Posting 金額必須使用整數。

TWD 第一版沒有小數，因此：

```text
NT$320
```

保存為：

```text
amount_minor = 320
```

禁止使用 floating-point number。

禁止：

```text
320.0
319.999999
```

---

## 8.3 Posting Balance Rule

同一個 Entry 內的所有 Posting 必須符合：

```text
SUM(amount_minor) = 0
```

例如：

```text
+320 expense.restaurant
-320 asset.cash
```

合法。

以下不合法：

```text
+320 expense.restaurant
-300 asset.cash
```

因為：

```text
320 - 300 = 20
```

---

## 8.4 Posting Count Rule

每筆 Entry 至少必須包含兩個 Posting。

```text
COUNT(postings) >= 2
```

---

## 8.5 Posting Constraints

```text
PRIMARY KEY (id)
FOREIGN KEY (entry_id) REFERENCES entries(id)
FOREIGN KEY (account_id) REFERENCES accounts(id)
NOT NULL (amount_minor)
CHECK (amount_minor != 0)
```

刪除 Entry 時，所屬 Posting 應在同一個 transaction 中一起刪除。

可以使用：

```text
ON DELETE CASCADE
```

但應只允許透過受控 service 操作刪除 Entry。

---

# 9. 核心不變量

以下規則是系統不可妥協的資料不變量。

## 9.1 Entry 與 Posting 必須共同存在

一筆完整交易必須同時包含：

* 一個 Entry
* 至少兩個 Posting

Entry 不得以沒有 Posting 的狀態完成寫入。

Posting 不得在沒有 Entry 的情況下存在。

---

## 9.2 所有 Posting 必須平衡

```text
SUM(amount_minor) = 0
```

此規則必須在寫入 transaction commit 前驗證。

---

## 9.3 Posting 金額不得為零

```text
amount_minor != 0
```

沒有財務影響的 Posting 不應存在。

---

## 9.4 所有金額使用整數

禁止使用浮點數。

所有金額使用最小貨幣單位表示。

第一版固定 TWD，因此一單位即為一元。

---

## 9.5 Account Key 必須唯一且穩定

Agent 應使用：

```text
account.key
```

或：

```text
account.id
```

不得依賴 `name` 進行精確寫入。

Account key 只能在使用者明確要求時修改，且必須與 Account type 在同一個原子操作中更新。
修改後，所有透過 `account_id` 關聯的歷史 Entry 與 Posting 會解析成新 key；舊 key 立即失效。

---

## 9.6 寫入必須具備原子性

Entry 與所有 Posting 必須在同一個 database transaction 中完成。

寫入流程：

```text
BEGIN

建立 Entry
建立所有 Postings
驗證 Posting 數量
驗證金額平衡
驗證 Account 狀態
驗證 dedup_key

COMMIT
```

若任何驗證失敗：

```text
ROLLBACK
```

不可留下部分完成的交易。

---

## 9.7 已停用 Account 不可新增 Posting

若：

```text
accounts.archived = true
```

則不得建立新的 Posting 指向該 Account。

既有 Posting 可以繼續保留。

---

## 9.8 已被引用的 Account 不可刪除

若 Account 已存在關聯 Posting，只能封存，不可刪除。

---

# 10. 標準交易範例

## 10.1 現金支出

使用現金支付餐費 NT$320。

### Entry

```json
{
  "date": "2026-07-24",
  "description": "麥當勞 早餐"
}
```

### Postings

```json
[
  {
    "account_key": "expense.restaurant",
    "amount_minor": 320
  },
  {
    "account_key": "asset.cash",
    "amount_minor": -320
  }
]
```

---

## 10.2 信用卡消費

信用卡購買日用品 NT$1,200。

```json
[
  {
    "account_key": "expense.household",
    "amount_minor": 1200
  },
  {
    "account_key": "liability.card.cathay",
    "amount_minor": -1200
  }
]
```

---

## 10.3 收入

薪資 NT$50,000 進入銀行帳戶。

```json
[
  {
    "account_key": "asset.bank.esun",
    "amount_minor": 50000
  },
  {
    "account_key": "income.salary",
    "amount_minor": -50000
  }
]
```

---

## 10.4 帳戶間轉帳

從銀行提領 NT$3,000 現金。

```json
[
  {
    "account_key": "asset.cash",
    "amount_minor": 3000
  },
  {
    "account_key": "asset.bank.esun",
    "amount_minor": -3000
  }
]
```

此交易不包含 income 或 expense account，因此不應被計入收入或支出。

---

## 10.5 信用卡繳款

從銀行帳戶支付信用卡帳單 NT$5,000。

```json
[
  {
    "account_key": "liability.card.cathay",
    "amount_minor": 5000
  },
  {
    "account_key": "asset.bank.esun",
    "amount_minor": -5000
  }
]
```

此交易只是減少銀行資產與信用卡負債，不是新的支出。

---

## 10.6 退款

餐飲消費退款 NT$200 至信用卡。

```json
[
  {
    "account_key": "expense.restaurant",
    "amount_minor": -200
  },
  {
    "account_key": "liability.card.cathay",
    "amount_minor": 200
  }
]
```

退款直接減少原本的支出分類。

---

## 10.7 拆分交易

超商消費 NT$250：

* 食物 NT$180
* 日用品 NT$70
* 使用信用卡付款

```json
[
  {
    "account_key": "expense.groceries",
    "amount_minor": 180
  },
  {
    "account_key": "expense.household",
    "amount_minor": 70
  },
  {
    "account_key": "liability.card.cathay",
    "amount_minor": -250
  }
]
```

---

## 10.8 期初餘額

系統啟用時，銀行已有 NT$20,000。

```json
[
  {
    "account_key": "asset.bank.esun",
    "amount_minor": 20000
  },
  {
    "account_key": "equity.opening_balance",
    "amount_minor": -20000
  }
]
```

期初餘額不應被記為收入。

---

# 11. Agent API Specification

Agent 不應分別呼叫：

```text
create_entry
create_posting
create_posting
```

Agent 只能提交完整 Entry。

## 11.1 Create Entry

### Operation

```text
create_entry
```

### Request

```json
{
  "operation": "create_entry",
  "date": "2026-07-24",
  "description": "麥當勞 早餐",
  "note": null,
  "dedup_key": "manual-message:019abc",
  "postings": [
    {
      "account_key": "expense.restaurant",
      "amount_minor": 320,
      "memo": null
    },
    {
      "account_key": "asset.cash",
      "amount_minor": -320,
      "memo": null
    }
  ]
}
```

### Server Responsibilities

Server 必須：

1. 驗證日期格式。
2. 驗證 description 不為空。
3. 驗證至少有兩個 Posting。
4. 驗證所有金額均為非零整數。
5. 驗證 Posting 金額總和為零。
6. 將 account key 解析為 account ID。
7. 驗證 Account 存在。
8. 驗證 Account 未停用。
9. 驗證 dedup key 尚未使用。
10. 在單一 transaction 中建立 Entry 與 Posting。
11. 回傳建立後的完整 Entry。

---

## 11.2 Create Entry Response

```json
{
  "id": "018f6f4a-0000-7000-8000-000000000001",
  "date": "2026-07-24",
  "description": "麥當勞 早餐",
  "note": null,
  "dedup_key": "manual-message:019abc",
  "postings": [
    {
      "id": "018f6f4a-0000-7000-8000-000000000002",
      "account": {
        "id": "018f6f4a-0000-7000-8000-000000000100",
        "key": "expense.restaurant",
        "name": "餐飲",
        "type": "expense"
      },
      "amount_minor": 320,
      "memo": null
    },
    {
      "id": "018f6f4a-0000-7000-8000-000000000003",
      "account": {
        "id": "018f6f4a-0000-7000-8000-000000000101",
        "key": "asset.cash",
        "name": "現金",
        "type": "asset"
      },
      "amount_minor": -320,
      "memo": null
    }
  ],
  "created_at": "2026-07-24T14:00:00+08:00",
  "updated_at": "2026-07-24T14:00:00+08:00"
}
```

---

# 12. Update Entry

個人記帳第一版允許直接修改 Entry。

可修改：

* `date`
* `description`
* `note`
* Posting account
* Posting amount
* Posting memo

修改 Posting 後，必須重新驗證：

```text
COUNT(postings) >= 2
SUM(amount_minor) = 0
```

更新也必須在單一 database transaction 中執行。

建議 API 接收完整替換後的 Posting 集合，而不是逐條 patch。

```json
{
  "operation": "update_entry",
  "entry_id": "018f...",
  "date": "2026-07-24",
  "description": "麥當勞 午餐",
  "note": "與朋友聚餐",
  "postings": [
    {
      "account_key": "expense.restaurant",
      "amount_minor": 420
    },
    {
      "account_key": "asset.cash",
      "amount_minor": -420
    }
  ]
}
```

Server 應將整組 Posting 視為一個完整狀態進行驗證與替換。

---

# 13. Delete Entry

第一版允許刪除錯誤交易。

刪除 Entry 時：

* 必須同時刪除所有 Posting
* 必須在單一 transaction 中完成
* 不可只刪除部分 Posting

```text
DELETE Entry
  └── DELETE all associated Postings
```

未來若加入銀行對帳或正式稽核功能，可以限制已對帳交易不可直接刪除。

---

# 14. Query and Reporting Rules

## 14.1 Account Balance

Account balance 可由 Posting 加總取得。

```text
balance = SUM(postings.amount_minor)
```

但顯示方式需要根據 Account type 處理。

建議 service layer 提供正規化後的顯示餘額，避免 UI 直接理解 debit／credit 符號。

---

## 14.2 Expense Total

某期間的支出：

```text
SUM(postings.amount_minor)
WHERE account.type = 'expense'
AND entry.date BETWEEN start_date AND end_date
```

---

## 14.3 Income Total

由於收入 account 通常為負數，可使用：

```text
-SUM(postings.amount_minor)
WHERE account.type = 'income'
AND entry.date BETWEEN start_date AND end_date
```

回傳給 UI 時應轉為正值。

---

## 14.4 Monthly Report

月份直接從 `entries.date` 篩選。

例如 2026 年 7 月：

```text
date >= 2026-07-01
date < 2026-08-01
```

不得依賴獨立 Month relation。

---

## 14.5 Text Search

搜尋範圍至少包含：

* `entries.description`
* `entries.note`
* `postings.memo`
* `accounts.name`

例如搜尋：

```text
麥當勞
OpenAI
早餐
訂閱
```

不需要建立 merchant table。

---

# 15. 建議初始 Accounts

## Assets

```text
asset.cash
asset.bank.esun
```

## Liabilities

```text
liability.card.cathay
```

## Income

```text
income.salary
income.other
```

## Expenses

```text
expense.restaurant
expense.groceries
expense.transport
expense.rent
expense.subscriptions
expense.household
expense.uncategorized
```

## Equity

```text
equity.opening_balance
```

實際帳戶應由使用者自行新增或停用。

---

# 16. 不包含於 v1 的功能

以下項目不屬於核心資料結構：

* Merchant entity
* Counterparty entity
* Merchant alias
* Receipt item
* Receipt image
* Evidence table
* Agent proposal table
* Month classification
* Accounting period
* Budget relation
* Tag relation
* Recurring transaction
* Subscription definition
* Foreign currency
* Exchange rate
* Bank reconciliation
* Audit log
* Posted／unposted workflow
* Immutable ledger
* Formal reversal entry requirement

這些功能未來可以在核心帳本外增加，不應提前加入核心 schema。

---

# 17. 未來擴充原則

任何未來功能都應盡量遵守：

> Ledger 是財務事實的唯一來源，其他資料只能引用 Ledger，不應複製或取代 Ledger 的金額與分類。

例如預算功能可以新增：

```text
monthly_budgets
- month
- expense_account_id
- limit_minor
```

但實際支出仍必須由 Posting 計算。

收據功能可以新增：

```text
attachments
- id
- entry_id
- file_url
```

但收據不應成為另一份交易金額來源。

Recurring transaction 可以產生 Entry，但不應取代 Entry。

---

# 18. 最終模型摘要

```text
accounts
- 定義資產、負債、收入、支出與權益

entries
- 定義一筆完整財務事件的日期與說明

postings
- 定義該事件對每個 Account 的金額影響
```

核心公式：

```text
Entry = Event
Posting = Financial Effect
Account = Destination of the Effect
```

每筆有效交易必須滿足：

```text
一個 Entry
至少兩個 Postings
所有 Posting 金額總和為零
```

對外 API 只暴露完整 Entry。

資料庫內部則使用：

```text
entries + postings
```

Agent 不得分別建立 Entry 與 Posting，也不得留下部分完成的交易。

---

# 19. v1 Backend Implementation Decisions

本節記錄後端實作對原始資料模型所加入的操作性決策。

## 19.1 多使用者隔離

v1 是多使用者系統，但每位使用者只有一個帳本。

* 新增 `users` 作為認證與資料歸屬來源。
* `accounts`、`entries`、`postings` 都保存 `user_id`。
* `accounts.key` 與 `entries.dedup_key` 的唯一性範圍是單一使用者。
* Posting 使用 composite foreign keys，確保 Account、Entry、Posting 屬於同一使用者。
* 對外 API 不接受由 client 指定 `user_id`；使用者只能由 access token 決定。

這些欄位只負責 tenant isolation，不改變 Account、Entry、Posting 的核心會計語意。

## 19.2 REST API

v1 使用 `/api/v1` REST API，不要求 request body 包含 `operation`。

```text
POST   /accounts
GET    /accounts
GET    /accounts/{id}
PATCH  /accounts/{id}
DELETE /accounts/{id}
GET    /accounts/{id}/balance

POST   /entries
GET    /entries
GET    /entries/{id}
PUT    /entries/{id}
DELETE /entries/{id}

GET    /reports/summary
GET    /reports/monthly
```

`POST /entries` 與 `PUT /entries/{id}` 仍只接受完整 Entry 與完整 Posting 集合。

## 19.3 Google Authentication

* 使用 Google OpenID Connect Authorization Code Flow 與 PKCE。
* 使用者必須先由 Rust 管理 CLI 依 email 預建。
* 首次登入只接受 Google verified email 與預建 email 相同者，然後綁定不可變的 Google subject。
* API 使用 15 分鐘 access JWT。
* Refresh token 是 30 天的 opaque random token，資料庫只保存 hash，且每次使用後輪替。
* 重播已輪替的 refresh token 時，撤銷同一 token family。

## 19.4 PostgreSQL Enforcement

除 service layer 驗證外，PostgreSQL 也強制執行：

* Posting 金額不可為零。
* Entry 在 transaction commit 時至少有兩個 Posting。
* Entry 在 transaction commit 時 Posting 金額總和必須為零。
* 新交易不可引用 archived Account。
* 跨使用者 Posting 關聯不合法。
* Account key 格式與 Account type 必須一致。

所有 migration 都位於 `backend/migrations/`，並具備對應的 up/down SQL。

## 19.5 Personal API Tokens

* 使用者可在已登入的 Web session 中建立、列出與撤銷 personal API token。
* API token 使用 `baln_pat_` prefix 與 opaque random secret；資料庫只保存 SHA-256 hash。
* API token 透過既有的 `Authorization: Bearer` header 存取相同的 `/api/v1` ledger API。
* API token 擁有使用者的完整 ledger 權限，可設定到期時間或持續有效至撤銷。
* API token 無法管理其他 API token。
* 停用使用者會阻止其 API token；撤銷 browser sessions 不影響 API token。

## 19.6 Flexible Budgets

Budget 是建立在核心帳本之上的使用者設定，不改變 Account、Entry 或 Posting 的會計語意。

* 每個 Budget 有開始日期、日／週／月／年週期、基本額度與一組 Account 篩選條件。
* 符合任一所選 Account 的 Entry，只會將其 expense Posting 合計計入一次；轉帳不計入支出。
* 每期未使用或超支的金額會正負雙向累計至下一期。
* Budget 編輯可選擇從開始日期重新計算，或保留目前累計並建立新的 rollover anchor。
* `budget_accounts` 使用 UUID 關聯 Account；Account key 或顯示名稱變更不會破壞 Budget。
