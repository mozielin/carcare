import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
const db = () => { if (!env.DB) throw new Error("資料庫尚未連線"); return env.DB; };

export async function GET() {
  const [products, washes] = await Promise.all([
    db().prepare(`SELECT id, name, category, unit, package_size AS packageSize, remaining, low_threshold AS lowThreshold FROM products ORDER BY remaining <= low_threshold DESC, name`).all(),
    db().prepare(`SELECT w.id, w.washed_at AS washedAt, w.note, GROUP_CONCAT(p.name || ' ' || printf('%g', u.amount) || p.unit, '、') AS summary FROM wash_sessions w LEFT JOIN wash_usages u ON u.wash_id = w.id LEFT JOIN products p ON p.id = u.product_id GROUP BY w.id ORDER BY w.washed_at DESC, w.created_at DESC LIMIT 12`).all(),
  ]);
  return Response.json({ products: products.results, washes: washes.results });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "addProduct") {
      const name = clean(body.name), category = clean(body.category), unit = clean(body.unit);
      const packageSize = positive(body.packageSize), remaining = nonNegative(body.remaining), lowThreshold = nonNegative(body.lowThreshold);
      if (!name || !category || !unit || remaining > packageSize) throw new Error("請確認用品資料與剩餘數量");
      await db().prepare("INSERT INTO products (name, category, unit, package_size, remaining, low_threshold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(name, category, unit, packageSize, remaining, lowThreshold, new Date().toISOString()).run();
    } else if (body.action === "restock") {
      const productId = positive(body.productId), amount = positive(body.amount), now = new Date().toISOString();
      await db().batch([
        db().prepare("UPDATE products SET remaining = remaining + ? WHERE id = ?").bind(amount, productId),
        db().prepare("INSERT INTO restocks (product_id, amount, created_at) VALUES (?, ?, ?)").bind(productId, amount, now),
      ]);
    } else if (body.action === "logWash") {
      const washedAt = clean(body.washedAt), note = clean(body.note) || null;
      const usages = Array.isArray(body.usages) ? body.usages as Array<Record<string, unknown>> : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(washedAt) || !usages.length) throw new Error("請選擇日期與用品");
      const normalized = usages.map((u) => ({ productId: positive(u.productId), amount: positive(u.amount) }));
      const placeholders = normalized.map(() => "?").join(",");
      const current = await db().prepare(`SELECT id, remaining FROM products WHERE id IN (${placeholders})`).bind(...normalized.map((u) => u.productId)).all<{ id: number; remaining: number }>();
      for (const usage of normalized) { const item = current.results.find((p) => p.id === usage.productId); if (!item || item.remaining < usage.amount) throw new Error("其中一項用品的剩餘量不足"); }
      const washId = crypto.randomUUID();
      const statements = [db().prepare("INSERT INTO wash_sessions (id, washed_at, note, created_at) VALUES (?, ?, ?, ?)").bind(washId, washedAt, note, new Date().toISOString())];
      for (const usage of normalized) {
        statements.push(db().prepare("INSERT INTO wash_usages (wash_id, product_id, amount) VALUES (?, ?, ?)").bind(washId, usage.productId, usage.amount));
        statements.push(db().prepare("UPDATE products SET remaining = remaining - ? WHERE id = ? AND remaining >= ?").bind(usage.amount, usage.productId, usage.amount));
      }
      await db().batch(statements);
    } else throw new Error("不支援的操作");
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "操作失敗" }, { status: 400 }); }
}

function clean(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 120) : ""; }
function positive(value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new Error("數量必須大於 0"); return number; }
function nonNegative(value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error("數量不可小於 0"); return number; }
