import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
const db = () => { if (!env.DB) throw new Error("資料庫尚未連線"); return env.DB; };

export async function GET() {
  await ensureDefaultFlows();
  const [products, washes, flows, flowItems] = await Promise.all([
    db().prepare(`SELECT p.id, p.name, p.category, p.unit, p.package_size AS packageSize, p.remaining, p.low_threshold AS lowThreshold, p.ph_type AS phType,
      GROUP_CONCAT(DISTINCT f.name) AS affectedFlowNames
      FROM products p LEFT JOIN wash_flow_items fi ON fi.product_id = p.id LEFT JOIN wash_flows f ON f.id = fi.flow_id
      WHERE p.active = 1 GROUP BY p.id ORDER BY p.remaining <= p.low_threshold DESC, p.name`).all(),
    db().prepare(`SELECT w.id, w.washed_at AS washedAt, w.note, w.flow_name AS flowName,
      GROUP_CONCAT(p.name || ' ' || printf('%g', u.amount) || p.unit, '、') AS summary
      FROM wash_sessions w LEFT JOIN wash_usages u ON u.wash_id = w.id LEFT JOIN products p ON p.id = u.product_id
      GROUP BY w.id ORDER BY w.washed_at DESC, w.created_at DESC LIMIT 12`).all(),
    db().prepare(`SELECT id, name, flow_type AS flowType FROM wash_flows ORDER BY CASE flow_type WHEN '2PH' THEN 1 WHEN '3PH' THEN 2 WHEN '快速保養' THEN 3 ELSE 4 END, id`).all(),
    db().prepare(`SELECT fi.flow_id AS flowId, fi.product_id AS productId, fi.amount, p.name AS productName, p.unit
      FROM wash_flow_items fi JOIN products p ON p.id = fi.product_id WHERE p.active = 1 ORDER BY fi.sort_order, fi.id`).all(),
  ]);
  const items = flowItems.results as Array<Record<string, unknown>>;
  return Response.json({
    products: products.results,
    washes: washes.results,
    flows: flows.results.map((flow: Record<string, unknown>) => ({ ...flow, items: items.filter((item) => item.flowId === flow.id) })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "addProduct") await addProduct(body);
    else if (body.action === "restock") await restockProduct(body);
    else if (body.action === "saveFlow") await saveFlow(body);
    else if (body.action === "logWash") await logWash(body);
    else if (body.action === "deleteProduct") await archiveProduct(body);
    else throw new Error("不支援的操作");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失敗" }, { status: 400 });
  }
}

async function addProduct(body: Record<string, unknown>) {
  const name = clean(body.name), category = productCategory(body.category), unit = clean(body.unit), phType = ph(body.phType);
  const packageSize = positive(body.packageSize), remaining = nonNegative(body.remaining), lowThreshold = nonNegative(body.lowThreshold);
  if (!name || !category || !unit || remaining > packageSize) throw new Error("請確認用品資料與剩餘數量");
  await db().prepare("INSERT INTO products (name, category, unit, package_size, remaining, low_threshold, ph_type, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)")
    .bind(name, category, unit, packageSize, remaining, lowThreshold, phType, new Date().toISOString()).run();
}

async function restockProduct(body: Record<string, unknown>) {
  const productId = positive(body.productId), bottles = integer(body.bottles);
  const product = await db().prepare("SELECT package_size AS packageSize FROM products WHERE id = ? AND active = 1").bind(productId).first<{ packageSize: number }>();
  if (!product) throw new Error("找不到這項用品");
  const amount = product.packageSize * bottles, now = new Date().toISOString();
  await db().batch([
    db().prepare("UPDATE products SET remaining = remaining + ? WHERE id = ? AND active = 1").bind(amount, productId),
    db().prepare("INSERT INTO restocks (product_id, amount, created_at) VALUES (?, ?, ?)").bind(productId, amount, now),
  ]);
}

async function saveFlow(body: Record<string, unknown>) {
  const flowId = body.flowId ? positive(body.flowId) : null;
  const flowType = flow(body.flowType), name = flowType === "自訂流程" ? clean(body.name) : flowType;
  if (!name) throw new Error("請輸入流程名稱");
  const items = normalizeUsages(body.items);
  if (!items.length) throw new Error("請至少設定一項藥劑與劑量");
  const productIds = items.map((item) => item.productId), placeholders = productIds.map(() => "?").join(",");
  const active = await db().prepare(`SELECT id FROM products WHERE active = 1 AND id IN (${placeholders})`).bind(...productIds).all<{ id: number }>();
  if (active.results.length !== new Set(productIds).size) throw new Error("流程中包含已移除的用品");
  let id = flowId;
  if (id) {
    await db().batch([
      db().prepare("UPDATE wash_flows SET name = ?, flow_type = ? WHERE id = ?").bind(name, flowType, id),
      db().prepare("DELETE FROM wash_flow_items WHERE flow_id = ?").bind(id),
    ]);
  } else {
    const created = await db().prepare("INSERT INTO wash_flows (name, flow_type, created_at) VALUES (?, ?, ?)").bind(name, flowType, new Date().toISOString()).run();
    id = Number(created.meta.last_row_id);
  }
  await db().batch(items.map((item, index) => db().prepare("INSERT INTO wash_flow_items (flow_id, product_id, amount, sort_order) VALUES (?, ?, ?, ?)").bind(id, item.productId, item.amount, index)));
}

async function logWash(body: Record<string, unknown>) {
  const washedAt = clean(body.washedAt), note = clean(body.note) || null, flowId = positive(body.flowId);
  const usages = normalizeUsages(body.usages);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(washedAt) || !usages.length) throw new Error("請選擇流程並確認用品");
  const selectedFlow = await db().prepare("SELECT name FROM wash_flows WHERE id = ?").bind(flowId).first<{ name: string }>();
  if (!selectedFlow) throw new Error("找不到這個流程");
  const placeholders = usages.map(() => "?").join(",");
  const current = await db().prepare(`SELECT id, remaining FROM products WHERE active = 1 AND id IN (${placeholders})`).bind(...usages.map((u) => u.productId)).all<{ id: number; remaining: number }>();
  for (const usage of usages) { const item = current.results.find((p) => p.id === usage.productId); if (!item || item.remaining < usage.amount) throw new Error("其中一項用品的剩餘量不足"); }
  const washId = crypto.randomUUID();
  const statements = [db().prepare("INSERT INTO wash_sessions (id, washed_at, note, flow_name, created_at) VALUES (?, ?, ?, ?, ?)").bind(washId, washedAt, note, selectedFlow.name, new Date().toISOString())];
  for (const usage of usages) {
    statements.push(db().prepare("INSERT INTO wash_usages (wash_id, product_id, amount) VALUES (?, ?, ?)").bind(washId, usage.productId, usage.amount));
    statements.push(db().prepare("UPDATE products SET remaining = remaining - ? WHERE id = ? AND active = 1 AND remaining >= ?").bind(usage.amount, usage.productId, usage.amount));
  }
  await db().batch(statements);
}

async function archiveProduct(body: Record<string, unknown>) {
  const productId = positive(body.productId), now = new Date().toISOString();
  const product = await db().prepare("SELECT id FROM products WHERE id = ? AND active = 1").bind(productId).first();
  if (!product) throw new Error("用品已經移除");
  await db().batch([
    db().prepare("DELETE FROM wash_flow_items WHERE product_id = ?").bind(productId),
    db().prepare("UPDATE products SET active = 0, deleted_at = ? WHERE id = ?").bind(now, productId),
  ]);
}

async function ensureDefaultFlows() {
  const count = await db().prepare("SELECT COUNT(*) AS count FROM wash_flows").first<{ count: number }>();
  if (Number(count?.count) > 0) return;
  const now = new Date().toISOString();
  await db().batch(["2PH", "3PH", "快速保養"].map((name) => db().prepare("INSERT INTO wash_flows (name, flow_type, created_at) VALUES (?, ?, ?)").bind(name, name, now)));
}

function normalizeUsages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<number, number>();
  for (const raw of value as Array<Record<string, unknown>>) unique.set(positive(raw.productId), positive(raw.amount));
  return [...unique].map(([productId, amount]) => ({ productId, amount }));
}
function clean(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 120) : ""; }
function positive(value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new Error("數量必須大於 0"); return number; }
function nonNegative(value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error("數量不可小於 0"); return number; }
function integer(value: unknown) { const number = positive(value); if (!Number.isInteger(number)) throw new Error("補貨罐數必須是整數"); return number; }
function ph(value: unknown) { const text = clean(value); if (!["酸性", "中性", "鹼性"].includes(text)) throw new Error("請選擇 pH 分類"); return text; }
function productCategory(value: unknown) { const text = clean(value); if (!["預洗", "正洗", "內裝", "其他"].includes(text)) throw new Error("請選擇用途分類"); return text; }
function flow(value: unknown) { const text = clean(value); if (!["2PH", "3PH", "快速保養", "自訂流程"].includes(text)) throw new Error("請選擇流程類型"); return text; }
