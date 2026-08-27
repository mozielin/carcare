import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
const db = () => { if (!env.DB) throw new Error("資料庫尚未連線"); return env.DB; };

export async function GET(request: Request) {
  const ownerEmail = await currentUserEmail();
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });
  await claimLegacyData(ownerEmail);
  if (new URL(request.url).searchParams.get("export") === "1") return exportBackup(ownerEmail);
  await ensureDefaultFlows(ownerEmail);
  const [products, washes, flows, flowItems, brands, washUsageItems] = await Promise.all([
    db().prepare(`SELECT p.id, p.brand, p.name, p.category, p.unit, p.package_size AS packageSize, p.remaining, p.low_threshold AS lowThreshold, p.ph_type AS phType,
      GROUP_CONCAT(DISTINCT f.name) AS affectedFlowNames
      FROM products p LEFT JOIN wash_flow_items fi ON fi.product_id = p.id LEFT JOIN wash_flows f ON f.id = fi.flow_id AND f.owner_email = ?
      WHERE p.active = 1 AND p.owner_email = ? GROUP BY p.id ORDER BY p.remaining <= p.low_threshold DESC, p.name`).bind(ownerEmail, ownerEmail).all(),
    db().prepare(`SELECT w.id, w.washed_at AS washedAt, w.note, w.flow_name AS flowName,
      (SELECT GROUP_CONCAT(label, '、') FROM (
        SELECT p.name || ' ' || printf('%g', u.amount) || p.unit AS label
        FROM wash_usages u JOIN products p ON p.id = u.product_id
        WHERE u.wash_id = w.id ORDER BY u.id
      )) AS summary
      FROM wash_sessions w WHERE w.owner_email = ? ORDER BY w.washed_at DESC, w.created_at DESC LIMIT 12`).bind(ownerEmail).all(),
    db().prepare(`SELECT id, name, flow_type AS flowType FROM wash_flows WHERE owner_email = ? ORDER BY CASE flow_type WHEN '2PH' THEN 1 WHEN '3PH' THEN 2 WHEN '快速保養' THEN 3 ELSE 4 END, id`).bind(ownerEmail).all(),
    db().prepare(`SELECT fi.flow_id AS flowId, fi.product_id AS productId, fi.amount, p.name AS productName, p.unit
      FROM wash_flow_items fi JOIN products p ON p.id = fi.product_id JOIN wash_flows f ON f.id = fi.flow_id WHERE p.active = 1 AND p.owner_email = ? AND f.owner_email = ? ORDER BY fi.sort_order, fi.id`).bind(ownerEmail, ownerEmail).all(),
    db().prepare("SELECT DISTINCT brand FROM products WHERE active = 1 AND owner_email = ? AND brand <> '' ORDER BY brand COLLATE NOCASE").bind(ownerEmail).all<{ brand: string }>(),
    db().prepare(`SELECT u.wash_id AS washId, p.name, p.category, p.ph_type AS phType, u.amount, p.unit
      FROM wash_usages u JOIN products p ON p.id = u.product_id
      WHERE u.wash_id IN (SELECT id FROM wash_sessions WHERE owner_email = ? ORDER BY washed_at DESC, created_at DESC LIMIT 12)
      ORDER BY u.id`).bind(ownerEmail).all(),
  ]);
  const items = flowItems.results as Array<Record<string, unknown>>;
  const usageItems = washUsageItems.results as Array<Record<string, unknown>>;
  return Response.json({
    products: products.results,
    washes: washes.results.map((wash: Record<string, unknown>) => ({ ...wash, items: usageItems.filter((item) => item.washId === wash.id) })),
    brands: brands.results.map((item) => item.brand),
    flows: flows.results.map((flow: Record<string, unknown>) => ({ ...flow, items: items.filter((item) => item.flowId === flow.id) })),
  });
}

export async function POST(request: Request) {
  const ownerEmail = await currentUserEmail();
  if (!ownerEmail) return Response.json({ error: "請先登入 ChatGPT" }, { status: 401 });
  try {
    await claimLegacyData(ownerEmail);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "addProduct") await addProduct(body, ownerEmail);
    else if (body.action === "updateProduct") await updateProduct(body, ownerEmail);
    else if (body.action === "restock") await restockProduct(body, ownerEmail);
    else if (body.action === "saveFlow") await saveFlow(body, ownerEmail);
    else if (body.action === "logWash") await logWash(body, ownerEmail);
    else if (body.action === "deleteProduct") await archiveProduct(body, ownerEmail);
    else if (body.action === "importBackup") return Response.json(await importBackup(body.backup, ownerEmail));
    else throw new Error("不支援的操作");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失敗" }, { status: 400 });
  }
}

async function addProduct(body: Record<string, unknown>, ownerEmail: string) {
  const brand = clean(body.brand), name = clean(body.name), category = productCategory(body.category), unit = category === "耗材" ? "次" : clean(body.unit), phType = category === "耗材" ? "中性" : ph(body.phType);
  const packageSize = integer(body.packageSize), remaining = integer(body.remaining), lowThreshold = integer(body.lowThreshold);
  if (!brand || !name || !category || !unit || remaining > packageSize) throw new Error("請確認品牌、用品資料與剩餘數量");
  await db().prepare("INSERT INTO products (owner_email, brand, name, category, unit, package_size, remaining, low_threshold, ph_type, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)")
    .bind(ownerEmail, brand, name, category, unit, packageSize, remaining, lowThreshold, phType, new Date().toISOString()).run();
}

async function updateProduct(body: Record<string, unknown>, ownerEmail: string) {
  const productId = positive(body.productId), brand = clean(body.brand), name = clean(body.name), category = productCategory(body.category), unit = category === "耗材" ? "次" : clean(body.unit), phType = category === "耗材" ? "中性" : ph(body.phType);
  const packageSize = integer(body.packageSize), remaining = integer(body.remaining), lowThreshold = integer(body.lowThreshold);
  if (!brand || !name || !unit || remaining > packageSize) throw new Error("請確認品牌、用品資料與剩餘數量");
  const result = await db().prepare("UPDATE products SET brand = ?, name = ?, category = ?, unit = ?, package_size = ?, remaining = ?, low_threshold = ?, ph_type = ? WHERE id = ? AND owner_email = ? AND active = 1")
    .bind(brand, name, category, unit, packageSize, remaining, lowThreshold, phType, productId, ownerEmail).run();
  if (!result.meta.changes) throw new Error("找不到這項用品");
}

async function restockProduct(body: Record<string, unknown>, ownerEmail: string) {
  const productId = positive(body.productId), bottles = integer(body.bottles);
  const product = await db().prepare("SELECT package_size AS packageSize, category FROM products WHERE id = ? AND owner_email = ? AND active = 1").bind(productId, ownerEmail).first<{ packageSize: number; category: string }>();
  if (!product) throw new Error("找不到這項用品");
  const amount = product.packageSize * bottles, now = new Date().toISOString();
  await db().batch([
    product.category === "耗材"
      ? db().prepare("UPDATE products SET remaining = package_size WHERE id = ? AND owner_email = ? AND active = 1").bind(productId, ownerEmail)
      : db().prepare("UPDATE products SET remaining = remaining + ? WHERE id = ? AND owner_email = ? AND active = 1").bind(amount, productId, ownerEmail),
    db().prepare("INSERT INTO restocks (product_id, amount, created_at) VALUES (?, ?, ?)").bind(productId, amount, now),
  ]);
}

async function saveFlow(body: Record<string, unknown>, ownerEmail: string) {
  const flowId = body.flowId ? positive(body.flowId) : null;
  const flowType = flow(body.flowType), name = flowType === "自訂流程" ? clean(body.name) : flowType;
  if (!name) throw new Error("請輸入流程名稱");
  const items = normalizeUsages(body.items);
  if (!items.length) throw new Error("請至少設定一項藥劑與劑量");
  const productIds = items.map((item) => item.productId), placeholders = productIds.map(() => "?").join(",");
  const active = await db().prepare(`SELECT id FROM products WHERE active = 1 AND owner_email = ? AND id IN (${placeholders})`).bind(ownerEmail, ...productIds).all<{ id: number }>();
  if (active.results.length !== new Set(productIds).size) throw new Error("流程中包含已移除的用品");
  let id = flowId;
  if (id) {
    const owned = await db().prepare("SELECT id FROM wash_flows WHERE id = ? AND owner_email = ?").bind(id, ownerEmail).first();
    if (!owned) throw new Error("找不到這個流程");
    await db().batch([
      db().prepare("UPDATE wash_flows SET name = ?, flow_type = ? WHERE id = ? AND owner_email = ?").bind(name, flowType, id, ownerEmail),
      db().prepare("DELETE FROM wash_flow_items WHERE flow_id = ?").bind(id),
    ]);
  } else {
    const created = await db().prepare("INSERT INTO wash_flows (owner_email, name, flow_type, created_at) VALUES (?, ?, ?, ?)").bind(ownerEmail, name, flowType, new Date().toISOString()).run();
    id = Number(created.meta.last_row_id);
  }
  await db().batch(items.map((item, index) => db().prepare("INSERT INTO wash_flow_items (flow_id, product_id, amount, sort_order) VALUES (?, ?, ?, ?)").bind(id, item.productId, item.amount, index)));
}

async function logWash(body: Record<string, unknown>, ownerEmail: string) {
  const washedAt = clean(body.washedAt), note = clean(body.note) || null, flowId = positive(body.flowId);
  const usages = normalizeUsages(body.usages);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(washedAt) || !usages.length) throw new Error("請選擇流程並確認用品");
  const selectedFlow = await db().prepare("SELECT name FROM wash_flows WHERE id = ? AND owner_email = ?").bind(flowId, ownerEmail).first<{ name: string }>();
  if (!selectedFlow) throw new Error("找不到這個流程");
  const placeholders = usages.map(() => "?").join(",");
  const current = await db().prepare(`SELECT id, remaining FROM products WHERE active = 1 AND owner_email = ? AND id IN (${placeholders})`).bind(ownerEmail, ...usages.map((u) => u.productId)).all<{ id: number; remaining: number }>();
  for (const usage of usages) { const item = current.results.find((p) => p.id === usage.productId); if (!item || item.remaining < usage.amount) throw new Error("其中一項用品的剩餘量不足"); }
  const washId = crypto.randomUUID();
  const statements = [db().prepare("INSERT INTO wash_sessions (id, owner_email, washed_at, note, flow_name, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(washId, ownerEmail, washedAt, note, selectedFlow.name, new Date().toISOString())];
  for (const usage of usages) {
    statements.push(db().prepare("INSERT INTO wash_usages (wash_id, product_id, amount) VALUES (?, ?, ?)").bind(washId, usage.productId, usage.amount));
    statements.push(db().prepare("UPDATE products SET remaining = remaining - ? WHERE id = ? AND owner_email = ? AND active = 1 AND remaining >= ?").bind(usage.amount, usage.productId, ownerEmail, usage.amount));
  }
  await db().batch(statements);
}

async function archiveProduct(body: Record<string, unknown>, ownerEmail: string) {
  const productId = positive(body.productId), now = new Date().toISOString();
  const product = await db().prepare("SELECT id FROM products WHERE id = ? AND owner_email = ? AND active = 1").bind(productId, ownerEmail).first();
  if (!product) throw new Error("用品已經移除");
  await db().batch([
    db().prepare("DELETE FROM wash_flow_items WHERE product_id = ?").bind(productId),
    db().prepare("UPDATE products SET active = 0, deleted_at = ? WHERE id = ? AND owner_email = ?").bind(now, productId, ownerEmail),
  ]);
}

async function ensureDefaultFlows(ownerEmail: string) {
  const count = await db().prepare("SELECT COUNT(*) AS count FROM wash_flows WHERE owner_email = ?").bind(ownerEmail).first<{ count: number }>();
  if (Number(count?.count) > 0) return;
  const now = new Date().toISOString();
  await db().batch(["2PH", "3PH", "快速保養"].map((name) => db().prepare("INSERT INTO wash_flows (owner_email, name, flow_type, created_at) VALUES (?, ?, ?, ?)").bind(ownerEmail, name, name, now)));
}

async function exportBackup(ownerEmail: string) {
  const [products, flows, flowItems, washes, washUsages, restocks] = await Promise.all([
    db().prepare(`SELECT id, brand, name, category, unit, package_size AS packageSize, remaining, low_threshold AS lowThreshold, ph_type AS phType, active, deleted_at AS deletedAt, created_at AS createdAt FROM products WHERE owner_email = ? ORDER BY id`).bind(ownerEmail).all(),
    db().prepare(`SELECT id, name, flow_type AS flowType, created_at AS createdAt FROM wash_flows WHERE owner_email = ? ORDER BY id`).bind(ownerEmail).all(),
    db().prepare(`SELECT fi.flow_id AS flowId, fi.product_id AS productId, fi.amount, fi.sort_order AS sortOrder FROM wash_flow_items fi JOIN wash_flows f ON f.id = fi.flow_id WHERE f.owner_email = ? ORDER BY fi.flow_id, fi.sort_order, fi.id`).bind(ownerEmail).all(),
    db().prepare(`SELECT id, washed_at AS washedAt, note, flow_name AS flowName, created_at AS createdAt FROM wash_sessions WHERE owner_email = ? ORDER BY washed_at, created_at`).bind(ownerEmail).all(),
    db().prepare(`SELECT u.wash_id AS washId, u.product_id AS productId, u.amount FROM wash_usages u JOIN wash_sessions w ON w.id = u.wash_id WHERE w.owner_email = ? ORDER BY u.id`).bind(ownerEmail).all(),
    db().prepare(`SELECT r.product_id AS productId, r.amount, r.created_at AS createdAt FROM restocks r JOIN products p ON p.id = r.product_id WHERE p.owner_email = ? ORDER BY r.id`).bind(ownerEmail).all(),
  ]);
  return Response.json({
    format: "car-care-inventory-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { products: products.results, flows: flows.results, flowItems: flowItems.results, washes: washes.results, washUsages: washUsages.results, restocks: restocks.results },
  }, { headers: { "Content-Disposition": `attachment; filename="car-care-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
}

async function importBackup(value: unknown, ownerEmail: string) {
  const root = object(value, "備份檔案格式不正確");
  if (root.format !== "car-care-inventory-backup" || root.version !== 1) throw new Error("這不是支援的洗車用品備份檔");
  const data = object(root.data, "備份內容不完整");
  const products = records(data.products, "用品", 500).map((item) => ({ oldId: integer(item.id), brand: requiredText(item.brand, "品牌"), name: requiredText(item.name, "用品名稱"), category: productCategory(item.category), unit: requiredText(item.unit, "單位"), packageSize: integer(item.packageSize), remaining: nonNegativeInteger(item.remaining), lowThreshold: integer(item.lowThreshold), phType: ph(item.phType), active: Number(item.active) === 0 ? 0 : 1, deletedAt: optionalText(item.deletedAt), createdAt: requiredText(item.createdAt, "建立日期") }));
  const flows = records(data.flows, "流程", 200).map((item) => ({ oldId: integer(item.id), name: requiredText(item.name, "流程名稱"), flowType: flow(item.flowType), createdAt: requiredText(item.createdAt, "建立日期") }));
  const flowItems = records(data.flowItems, "流程用品", 1000).map((item) => ({ flowId: integer(item.flowId), productId: integer(item.productId), amount: integer(item.amount), sortOrder: nonNegativeInteger(item.sortOrder) }));
  const washes = records(data.washes, "洗車紀錄", 500).map((item) => ({ oldId: requiredText(item.id, "洗車紀錄"), washedAt: requiredText(item.washedAt, "洗車日期"), note: optionalText(item.note), flowName: optionalText(item.flowName), createdAt: requiredText(item.createdAt, "建立日期") }));
  const washUsages = records(data.washUsages, "洗車用量", 3000).map((item) => ({ washId: requiredText(item.washId, "洗車紀錄"), productId: integer(item.productId), amount: integer(item.amount) }));
  const restocks = records(data.restocks, "補貨紀錄", 2000).map((item) => ({ productId: integer(item.productId), amount: integer(item.amount), createdAt: requiredText(item.createdAt, "建立日期") }));
  if (new Set(products.map((item) => item.oldId)).size !== products.length || new Set(flows.map((item) => item.oldId)).size !== flows.length || new Set(washes.map((item) => item.oldId)).size !== washes.length) throw new Error("備份內含重複的資料編號");
  const totalRows = products.length + flows.length + flowItems.length + washes.length + washUsages.length + restocks.length;
  if (totalRows > 5000) throw new Error("備份資料量過大，請分開處理");

  const [productMax, flowMax] = await Promise.all([
    db().prepare("SELECT COALESCE(MAX(id), 0) AS value FROM products").first<{ value: number }>(),
    db().prepare("SELECT COALESCE(MAX(id), 0) AS value FROM wash_flows").first<{ value: number }>(),
  ]);
  let nextProductId = Number(productMax?.value || 0) + 1, nextFlowId = Number(flowMax?.value || 0) + 1;
  const productIds = new Map(products.map((item) => [item.oldId, nextProductId++]));
  const flowIds = new Map(flows.map((item) => [item.oldId, nextFlowId++]));
  const washIds = new Map(washes.map((item) => [item.oldId, crypto.randomUUID()]));
  const statements: D1PreparedStatement[] = [
    db().prepare("DELETE FROM wash_usages WHERE wash_id IN (SELECT id FROM wash_sessions WHERE owner_email = ?)").bind(ownerEmail),
    db().prepare("DELETE FROM wash_sessions WHERE owner_email = ?").bind(ownerEmail),
    db().prepare("DELETE FROM restocks WHERE product_id IN (SELECT id FROM products WHERE owner_email = ?)").bind(ownerEmail),
    db().prepare("DELETE FROM wash_flow_items WHERE flow_id IN (SELECT id FROM wash_flows WHERE owner_email = ?)").bind(ownerEmail),
    db().prepare("DELETE FROM wash_flows WHERE owner_email = ?").bind(ownerEmail),
    db().prepare("DELETE FROM products WHERE owner_email = ?").bind(ownerEmail),
  ];
  for (const item of products) statements.push(db().prepare("INSERT INTO products (id, owner_email, brand, name, category, unit, package_size, remaining, low_threshold, ph_type, active, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(productIds.get(item.oldId), ownerEmail, item.brand, item.name, item.category, item.unit, item.packageSize, item.remaining, item.lowThreshold, item.phType, item.active, item.deletedAt, item.createdAt));
  for (const item of flows) statements.push(db().prepare("INSERT INTO wash_flows (id, owner_email, name, flow_type, created_at) VALUES (?, ?, ?, ?, ?)").bind(flowIds.get(item.oldId), ownerEmail, item.name, item.flowType, item.createdAt));
  for (const item of flowItems) { const flowId = flowIds.get(item.flowId), productId = productIds.get(item.productId); if (!flowId || !productId) throw new Error("流程用品關聯不完整"); statements.push(db().prepare("INSERT INTO wash_flow_items (flow_id, product_id, amount, sort_order) VALUES (?, ?, ?, ?)").bind(flowId, productId, item.amount, item.sortOrder)); }
  for (const item of washes) statements.push(db().prepare("INSERT INTO wash_sessions (id, owner_email, washed_at, note, flow_name, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(washIds.get(item.oldId), ownerEmail, item.washedAt, item.note, item.flowName, item.createdAt));
  for (const item of washUsages) { const washId = washIds.get(item.washId), productId = productIds.get(item.productId); if (!washId || !productId) throw new Error("洗車用量關聯不完整"); statements.push(db().prepare("INSERT INTO wash_usages (wash_id, product_id, amount) VALUES (?, ?, ?)").bind(washId, productId, item.amount)); }
  for (const item of restocks) { const productId = productIds.get(item.productId); if (!productId) throw new Error("補貨紀錄關聯不完整"); statements.push(db().prepare("INSERT INTO restocks (product_id, amount, created_at) VALUES (?, ?, ?)").bind(productId, item.amount, item.createdAt)); }
  await db().batch(statements);
  await ensureDefaultFlows(ownerEmail);
  return { ok: true, imported: { products: products.filter((item) => item.active).length, flows: flows.length, washes: washes.length, restocks: restocks.length } };
}

function object(value: unknown, message: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message); return value as Record<string, unknown>; }
function records(value: unknown, label: string, max: number) { if (!Array.isArray(value) || value.length > max) throw new Error(`${label}資料格式不正確或數量過多`); return value.map((item) => object(item, `${label}資料格式不正確`)); }
function requiredText(value: unknown, label: string) { const text = clean(value); if (!text) throw new Error(`${label}不可空白`); return text; }
function optionalText(value: unknown) { return value == null ? null : clean(value) || null; }
function nonNegativeInteger(value: unknown) { const number = nonNegative(value); if (!Number.isInteger(number)) throw new Error("數量必須是整數"); return number; }

async function currentUserEmail() {
  const user = await getChatGPTUser();
  return user?.email.trim().toLowerCase() || null;
}

async function claimLegacyData(ownerEmail: string) {
  const legacyOwner = String((env as unknown as Record<string, unknown>).LEGACY_OWNER_EMAIL || "").trim().toLowerCase();
  if (!legacyOwner || ownerEmail !== legacyOwner) return;
  await db().batch([
    db().prepare("UPDATE products SET owner_email = ? WHERE owner_email = ''").bind(ownerEmail),
    db().prepare("UPDATE wash_flows SET owner_email = ? WHERE owner_email = ''").bind(ownerEmail),
    db().prepare("UPDATE wash_sessions SET owner_email = ? WHERE owner_email = ''").bind(ownerEmail),
  ]);
}

function normalizeUsages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<number, number>();
  for (const raw of value as Array<Record<string, unknown>>) unique.set(positive(raw.productId), integer(raw.amount));
  return [...unique].map(([productId, amount]) => ({ productId, amount }));
}
function clean(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 120) : ""; }
function positive(value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new Error("數量必須大於 0"); return number; }
function nonNegative(value: unknown) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error("數量不可小於 0"); return number; }
function integer(value: unknown) { const number = positive(value); if (!Number.isInteger(number)) throw new Error("數量必須是整數"); return number; }
function ph(value: unknown) { const text = clean(value); if (!["酸性", "中性", "鹼性"].includes(text)) throw new Error("請選擇 pH 分類"); return text; }
function productCategory(value: unknown) { const text = clean(value); if (!["預洗", "正洗", "保養", "玻璃", "耗材", "內裝", "其他"].includes(text)) throw new Error("請選擇用途分類"); return text; }
function flow(value: unknown) { const text = clean(value); if (!["2PH", "3PH", "快速保養", "自訂流程"].includes(text)) throw new Error("請選擇流程類型"); return text; }
