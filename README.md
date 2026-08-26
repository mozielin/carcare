# 洗車用品庫存

用來管理洗車用品餘量與洗車流程的 Sites 專案。支援 pH 分類、按罐補貨、2PH／3PH／快速保養／自訂流程、預設藥劑劑量、兩步驟洗車紀錄、安全移除用品與低庫存提醒。

## 建立新的 Site

將整個專案交給 ChatGPT Sites，要求「使用這份原始碼建立新的 Site」。新 Site 會建立自己的 D1 資料庫與網址，不會連到原本的網站。

## 本機開發

需要 Node.js 22.13 以上版本。

```bash
npm ci
npm run dev
```

資料庫結構位於 `db/schema.ts`，Drizzle migrations 位於 `drizzle/`。正式庫存資料不包含在原始碼中。
