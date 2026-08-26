# 洗車用品庫存

用來管理洗車用品餘量的 Sites 專案。可新增用品、設定低庫存門檻、記錄每次洗車用量、自動扣除庫存、補貨並查看最近紀錄。

## 建立新的 Site

將整個專案交給 ChatGPT Sites，要求「使用這份原始碼建立新的 Site」。新 Site 會建立自己的 D1 資料庫與網址，不會連到原本的網站。

## 放到 GitHub

1. 建立一個空白 GitHub repository。
2. 將 ZIP 解壓後的全部內容放入 repository。
3. 提交並推送到 `main`。

## 本機開發

需要 Node.js 22.13 以上版本。

```bash
npm ci
npm run dev
```

資料庫結構位於 `db/schema.ts`，Drizzle migration 位於 `drizzle/`。正式庫存資料不包含在原始碼中。
