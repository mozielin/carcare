"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Archive, Beaker, CalendarDays, Download, Droplets, GripVertical, History, Menu, PackagePlus, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

type Product = { id: number; brand: string; name: string; category: string; unit: string; packageSize: number; remaining: number; lowThreshold: number; phType: "酸性" | "中性" | "鹼性"; affectedFlowNames: string | null };
type FlowItem = { flowId: number; productId: number; amount: number; productName: string; unit: string };
type WashFlow = { id: number; name: string; flowType: string; items: FlowItem[] };
type WashUsageItem = { washId: string; name: string; category: string; phType: "酸性" | "中性" | "鹼性"; amount: number; unit: string };
type Wash = { id: string; washedAt: string; note: string | null; flowName: string | null; summary: string | null; items: WashUsageItem[] };
type Data = { products: Product[]; brands: string[]; flows: WashFlow[]; washes: Wash[] };
type Submit = (action: string, payload: Record<string, unknown>) => Promise<void>;
const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
const navItems = [{ value: "inventory", label: "用品庫存" }, { value: "flows", label: "流程管理" }, { value: "history", label: "洗車紀錄" }, { value: "backup", label: "匯出／匯入" }] as const;

export default function InventoryApp({
  user,
}: {
  user: { displayName: string; email: string };
}) {
  const [data, setData] = useState<Data>({
    products: [],
    brands: [],
    flows: [],
    washes: [],
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("inventory");
  const [addOpen, setAddOpen] = useState(false),
    [washOpen, setWashOpen] = useState(false),
    [flowOpen, setFlowOpen] = useState(false);
  const [restock, setRestock] = useState<Product | null>(null),
    [editingProduct, setEditingProduct] = useState<Product | null>(null),
    [deleting, setDeleting] = useState<Product | null>(null),
    [editingFlow, setEditingFlow] = useState<WashFlow | null>(null);
  const guard = useRef(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/inventory", { cache: "no-store" });
    if (!r.ok) throw new Error();
    setData(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(() => {
      setLoading(false);
      toast.error("暫時無法讀取庫存");
    });
  }, [load]);
  const submit: Submit = async (action, payload) => {
    if (guard.current) throw new Error("操作正在處理中，請稍候");
    guard.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || "操作失敗");
      await load();
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  const lowStock = useMemo(
    () => data.products.filter((p) => p.remaining <= p.lowThreshold),
    [data.products],
  );
  const average = data.products.length
    ? Math.round(
        data.products.reduce(
          (s, p) => s + Math.min(100, (p.remaining / p.packageSize) * 100),
          0,
        ) / data.products.length,
      )
    : 0;
  const daysSinceWash = data.washes.length
    ? daysSince(data.washes[0].washedAt)
    : null;
  const washTone =
    daysSinceWash === null
      ? "neutral"
      : daysSinceWash > 14
        ? "danger"
        : daysSinceWash > 7
          ? "warning"
          : "success";
  return (
    <main className="min-h-screen bg-[#f2f7f7] text-slate-950">
      <Toaster position="top-center" richColors />
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-cyan-950 text-cyan-100">
              <Droplets className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[.18em] text-cyan-700">
                CAR CARE
              </p>
              <h1 className="truncate font-semibold tracking-tight">
                洗車用品庫存
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="max-w-44 truncate text-xs font-medium text-slate-700">
                {user.displayName}
              </p>
              <a
                href="/signout-with-chatgpt?return_to=%2F"
                target="_top"
                className="text-[11px] text-slate-500 hover:text-cyan-800"
              >
                切換帳號
              </a>
            </div>
            <Button
              disabled={busy}
              onClick={() => setWashOpen(true)}
              className="rounded-xl bg-cyan-950 px-3 text-white hover:bg-cyan-900"
            >
              <Sparkles className="size-4" />
              <span className="hidden min-[430px]:inline">記錄洗車</span>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  aria-label="開啟功能選單"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[82%] bg-white">
                <SheetHeader>
                  <SheetTitle>功能選單</SheetTitle>
                  <SheetDescription>{user.displayName}</SheetDescription>
                </SheetHeader>
                <nav className="grid gap-2 px-4">
                  {navItems.map((item) => (
                    <SheetClose asChild key={item.value}>
                      <button
                        onClick={() => setActiveTab(item.value)}
                        className={`rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${activeTab === item.value ? "bg-cyan-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-cyan-50"}`}
                      >
                        {item.label}
                      </button>
                    </SheetClose>
                  ))}
                </nav>
                <SheetFooter>
                  <a
                    href="/signout-with-chatgpt?return_to=%2F"
                    target="_top"
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-600"
                  >
                    切換帳號
                  </a>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.45fr_.7fr_.7fr_.7fr]">
          <div className="relative overflow-hidden rounded-[28px] bg-cyan-950 p-6 text-white shadow-[0_18px_55px_rgba(8,51,68,.17)] sm:p-8 md:col-span-2 xl:col-span-1">
            <div className="absolute -right-16 -top-20 size-52 rounded-full border-[28px] border-cyan-700/30" />
            <p className="text-sm text-cyan-200">目前庫存概況</p>
            <div className="mt-8 flex items-end gap-3">
              <strong className="text-6xl font-semibold tracking-[-.06em]">
                {loading ? "—" : average}
              </strong>
              <span className="pb-2 text-cyan-200">% 平均剩餘</span>
            </div>
            <p className="mt-3 text-sm text-cyan-100/75">
              共管理 {data.products.length} 項用品
            </p>
          </div>
          <Metric
            icon={<Archive />}
            value={data.products.length}
            label="庫存品項"
          />
          <Metric
            icon={<AlertTriangle />}
            value={lowStock.length}
            label="需要補貨"
            tone={lowStock.length > 0 ? "warning" : "neutral"}
          />
          <Metric
            icon={<CalendarDays />}
            value={loading ? "—" : daysSinceWash === null ? "—" : daysSinceWash}
            suffix={daysSinceWash === null ? undefined : "天"}
            label={daysSinceWash === null ? "尚無洗車紀錄" : "距上次洗車"}
            tone={washTone}
          />
        </section>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="mt-6"
        >
          <TabsContent value="inventory" className="!mt-0">
            <SectionTitle eyebrow="INVENTORY" title="用品餘量">
              <AddProductDialog
                open={addOpen}
                setOpen={setAddOpen}
                submit={submit}
                busy={busy}
                brands={data.brands}
              />
            </SectionTitle>
            {loading ? (
              <Loading />
            ) : data.products.length === 0 ? (
              <EmptyState onAdd={() => setAddOpen(true)} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onRestock={() => setRestock(p)}
                    onEdit={() => setEditingProduct(p)}
                    onDelete={() => setDeleting(p)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="flows" className="!mt-0">
            <SectionTitle eyebrow="WASH ROUTINES" title="洗車流程">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  setEditingFlow(null);
                  setFlowOpen(true);
                }}
              >
                <Plus />
                自訂流程
              </Button>
            </SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              {data.flows.map((flow) => (
                <article
                  key={flow.id}
                  className="rounded-3xl border border-white bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                      {flow.flowType}
                    </span>
                    <button
                      aria-label={`編輯 ${flow.name}`}
                      onClick={() => {
                        setEditingFlow(flow);
                        setFlowOpen(true);
                      }}
                      className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-cyan-800"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{flow.name}</h3>
                  {flow.items.length ? (
                    <div className="mt-4 space-y-2">
                      {flow.items.map((item) => (
                        <div
                          key={item.productId}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-slate-600">
                            {item.productName}
                          </span>
                          <span className="font-medium">
                            {format(item.amount)} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-amber-700">
                      尚未設定藥劑，請點右上角編輯。
                    </p>
                  )}
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="history" className="!mt-0">
            <HistoryList washes={data.washes} />
          </TabsContent>
          <TabsContent value="backup" className="!mt-0">
            <BackupPanel submit={submit} busy={busy} />
          </TabsContent>
        </Tabs>
      </div>
      <WashDialog
        open={washOpen}
        setOpen={setWashOpen}
        flows={data.flows}
        products={data.products}
        submit={submit}
        busy={busy}
      />
      <FlowDialog
        open={flowOpen}
        setOpen={setFlowOpen}
        flow={editingFlow}
        products={data.products}
        submit={submit}
        busy={busy}
      />
      <RestockDialog
        product={restock}
        setProduct={setRestock}
        submit={submit}
        busy={busy}
      />
      <EditProductDialog
        product={editingProduct}
        setProduct={setEditingProduct}
        submit={submit}
        busy={busy}
        brands={data.brands}
      />
      <DeleteProductDialog
        product={deleting}
        setProduct={setDeleting}
        submit={submit}
        busy={busy}
      />
    </main>
  );
}

function ProductCard({
  product: p,
  onRestock,
  onEdit,
  onDelete,
}: {
  product: Product;
  onRestock: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const consumable = p.category === "耗材",
    bottleCount = p.remaining > 0 ? Math.ceil(p.remaining / p.packageSize) : 0,
    bottleRemaining =
      p.remaining > 0 ? p.remaining % p.packageSize || p.packageSize : 0,
    percent = Math.max(
      0,
      Math.min(
        100,
        ((consumable ? p.remaining : bottleRemaining) / p.packageSize) * 100,
      ),
    ),
    low = p.remaining <= p.lowThreshold;
  return (
    <article className="rounded-3xl border border-white bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {p.category}
          </span>
          {!consumable && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${phClass(p.phType)}`}
            >
              {p.phType}
            </span>
          )}
        </div>
        {low && (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
            {consumable ? "需更換" : "補貨"}
          </span>
        )}
      </div>
      <p className="mt-4 text-[13px] font-semibold tracking-wide text-slate-500">
        {p.brand || "未設定品牌"}
      </p>
      <h3 className="mt-0.5 text-3xl font-semibold tracking-tight">{p.name}</h3>
      <div className="mt-8 flex items-baseline justify-between">
        <span className="text-lg font-semibold">{format(p.remaining)}</span>
        <span className="text-sm text-slate-500">
          {consumable
            ? `剩餘次數 / ${format(p.packageSize)} 次`
            : `${p.unit} 總庫存`}
        </span>
      </div>
      {consumable ? (
        <p className="mt-3 text-xs text-slate-500">使用至 0 次後更換新品</p>
      ) : (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            目前這瓶 {format(bottleRemaining)} / {format(p.packageSize)}{" "}
            {p.unit}
          </span>
          <span className="rounded-full bg-cyan-50 px-2.5 py-1 font-semibold text-cyan-800">
            ×{bottleCount}
          </span>
        </div>
      )}
      <Progress
        value={percent}
        className={`mt-2 h-2 ${low ? "[&_[data-slot=progress-indicator]]:bg-amber-500" : "[&_[data-slot=progress-indicator]]:bg-cyan-700"}`}
      />
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={onRestock}
          className="text-sm font-medium text-cyan-800 hover:text-cyan-600"
        >
          ＋ {consumable ? "更換新品" : "補充庫存"}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            aria-label={`編輯 ${p.name}`}
            className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-cyan-50 hover:text-cyan-800"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label={`刪除 ${p.name}`}
            className="grid size-9 place-items-center rounded-xl text-slate-300 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function AddProductDialog({
  open,
  setOpen,
  submit,
  busy,
  brands,
}: DialogProps & { brands: string[] }) {
  const [packageSize, setPackageSize] = useState(""),
    [remaining, setRemaining] = useState(""),
    [lowThreshold, setLowThreshold] = useState(""),
    [category, setCategory] = useState("預洗");
  const [saving, setSaving] = useState(false);
  const consumable = category === "耗材";
  function changePackage(value: string) {
    setPackageSize(value);
    setRemaining(value);
    const amount = Number(value);
    setLowThreshold(
      value && Number.isFinite(amount)
        ? String(consumable ? 1 : Math.max(1, Math.round(amount * 0.1)))
        : "",
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || busy) return;
    setSaving(true);
    const toastId = toast.loading("正在儲存用品…");
    try {
      await submit(
        "addProduct",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      setPackageSize("");
      setRemaining("");
      setLowThreshold("");
      setCategory("預洗");
      setOpen(false);
      toast.success("用品已加入庫存", { id: toastId });
    } catch (e) {
      toast.error(msg(e), { id: toastId });
    } finally {
      setSaving(false);
    }
  }
  const locked = saving || busy;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!locked) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl">
          <Plus />
          新增用品
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>新增洗車用品</DialogTitle>
          <DialogDescription>
            {consumable
              ? "耗材會依可使用次數扣除，歸零時提醒更換新品。"
              : "輸入瓶身容量後，會自動填入目前剩餘與 10% 提醒門檻。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} aria-busy={locked} className="grid gap-4">
          <BrandField brands={brands} />
          <Field label="用品名稱">
            <input className={inputClass} name="name" required />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="用途分類">
              <input type="hidden" name="category" value={category} />
              <Select
                value={category}
                disabled={locked}
                onValueChange={(value) => {
                  setCategory(value);
                  if (value === "耗材") setLowThreshold("1");
                }}
              >
                <SelectTrigger className={`${inputClass} w-full`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="預洗">預洗</SelectItem>
                  <SelectItem value="正洗">正洗</SelectItem>
                  <SelectItem value="保養">保養</SelectItem>
                  <SelectItem value="玻璃">玻璃</SelectItem>
                  <SelectItem value="耗材">耗材</SelectItem>
                  <SelectItem value="內裝">內裝</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="pH 分類">
              {consumable ? (
                <>
                  <input type="hidden" name="phType" value="中性" />
                  <input className={inputClass} value="不適用" disabled />
                </>
              ) : (
                <select
                  className={inputClass}
                  name="phType"
                  defaultValue="中性"
                >
                  <option>酸性</option>
                  <option>中性</option>
                  <option>鹼性</option>
                </select>
              )}
            </Field>
            <Field label="單位">
              {consumable ? (
                <input className={inputClass} name="unit" value="次" readOnly />
              ) : (
                <select className={inputClass} name="unit" defaultValue="ml">
                  <option>ml</option>
                  <option>g</option>
                  <option>顆</option>
                  <option>片</option>
                </select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={consumable ? "可使用次數" : "瓶身容量"}>
              <NumberInput
                name="packageSize"
                value={packageSize}
                onChange={(e) => changePackage(e.target.value)}
              />
            </Field>
            <Field label={consumable ? "剩餘次數" : "目前剩餘"}>
              <NumberInput
                name="remaining"
                value={remaining}
                onChange={(e) => setRemaining(e.target.value)}
              />
            </Field>
            <Field label={consumable ? "更換提醒" : "提醒門檻"}>
              <NumberInput
                name="lowThreshold"
                value={lowThreshold}
                onChange={(e) => setLowThreshold(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={locked}
              type="submit"
              aria-disabled={locked}
              className="min-w-28 rounded-xl bg-cyan-950"
            >
              {locked ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  儲存中…
                </>
              ) : (
                "儲存用品"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({ product, setProduct, submit, busy, brands }: { product: Product | null; setProduct: (v: Product | null) => void; submit: Submit; busy: boolean; brands: string[] }) { return <Dialog open={!!product} onOpenChange={(v) => !v && setProduct(null)}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>編輯洗車用品</DialogTitle><DialogDescription>修改用品資料；流程關聯與過去洗車紀錄會保留。</DialogDescription></DialogHeader>{product && <EditProductForm key={product.id} product={product} setProduct={setProduct} submit={submit} busy={busy} brands={brands} />}</DialogContent></Dialog>; }

function EditProductForm({ product, setProduct, submit, busy, brands }: { product: Product; setProduct: (v: Product | null) => void; submit: Submit; busy: boolean; brands: string[] }) {
  const [category, setCategory] = useState(product.category), consumable = category === "耗材";
  async function save(form: FormData) { try { await submit("updateProduct", { productId: product.id, ...Object.fromEntries(form) }); setProduct(null); toast.success("用品資料已更新"); } catch (e) { toast.error(msg(e)); } }
  return <form action={save} className="grid gap-4"><BrandField brands={brands} initialBrand={product.brand} /><Field label="用品名稱"><input className={inputClass} name="name" defaultValue={product.name} required /></Field><div className="grid grid-cols-3 gap-3"><Field label="用途分類"><Select name="category" value={category} onValueChange={setCategory}><SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="預洗">預洗</SelectItem><SelectItem value="正洗">正洗</SelectItem><SelectItem value="保養">保養</SelectItem><SelectItem value="玻璃">玻璃</SelectItem><SelectItem value="耗材">耗材</SelectItem><SelectItem value="內裝">內裝</SelectItem><SelectItem value="其他">其他</SelectItem></SelectContent></Select></Field><Field label="pH 分類"><select className={inputClass} name="phType" defaultValue={product.phType} disabled={consumable}><option>酸性</option><option>中性</option><option>鹼性</option></select></Field><Field label="單位">{consumable ? <input className={inputClass} name="unit" value="次" readOnly /> : <select className={inputClass} name="unit" defaultValue={product.unit}><option>ml</option><option>g</option><option>顆</option><option>片</option></select>}</Field></div><div className="grid grid-cols-3 gap-3"><Field label={consumable ? "可使用次數" : "瓶身容量"}><NumberInput name="packageSize" defaultValue={product.packageSize} /></Field><Field label={consumable ? "剩餘次數" : "目前剩餘"}><NumberInput name="remaining" defaultValue={product.remaining} /></Field><Field label={consumable ? "更換提醒" : "提醒門檻"}><NumberInput name="lowThreshold" defaultValue={product.lowThreshold} /></Field></div><DialogFooter><Button variant="outline" type="button" disabled={busy} onClick={() => setProduct(null)} className="rounded-xl">取消</Button><Button disabled={busy} type="submit" className="rounded-xl bg-cyan-950">{busy ? "儲存中…" : "儲存修改"}</Button></DialogFooter></form>;
}

function BrandField({ brands, initialBrand }: { brands: string[]; initialBrand?: string }) { const options = Array.from(new Set([...(initialBrand ? [initialBrand] : []), ...brands])); const [value, setValue] = useState(initialBrand || (options.length ? options[0] : "__new__")); return <Field label="品牌">{value === "__new__" ? <div className="grid grid-cols-[1fr_auto] gap-2"><input className={inputClass} name="brand" placeholder="輸入新品牌名稱" required autoFocus /><Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setValue(options[0] || "__new__")} disabled={!options.length}>選擇既有品牌</Button></div> : <Select name="brand" value={value} onValueChange={setValue}><SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger><SelectContent>{options.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}<SelectItem value="__new__">＋ 新增品牌</SelectItem></SelectContent></Select>}</Field>; }

function RestockDialog({ product, setProduct, submit, busy }: { product: Product | null; setProduct: (v: Product | null) => void; submit: Submit; busy: boolean }) { const [bottles, setBottles] = useState(1), consumable = product?.category === "耗材"; async function save() { if (!product) return; try { await submit("restock", { productId: product.id, bottles: consumable ? 1 : bottles }); setProduct(null); setBottles(1); toast.success(consumable ? "已更換新品，使用次數已重設" : `已補充 ${bottles} 罐`); } catch (e) { toast.error(msg(e)); } } return <Dialog open={!!product} onOpenChange={(v) => !v && setProduct(null)}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>{consumable ? "更換耗材" : "補充庫存"}</DialogTitle><DialogDescription>{consumable ? `${product?.name} 更換新品後，可重新使用 ${product && format(product.packageSize)} 次。` : `${product?.name} 每罐 ${product && format(product.packageSize)} ${product?.unit}`}</DialogDescription></DialogHeader>{!consumable && <Field label="補充幾罐"><input className={inputClass} type="number" min="1" step="1" value={bottles} onChange={(e) => setBottles(Math.max(1, Number(e.target.value)))} /></Field>}<div className="rounded-2xl bg-cyan-50 p-4 text-sm text-cyan-900">{consumable ? <>剩餘次數將重設為 <strong>{product && format(product.packageSize)} 次</strong></> : <>庫存將增加 <strong>{product ? format(product.packageSize * bottles) : 0} {product?.unit}</strong></>}</div><DialogFooter><Button disabled={busy} onClick={save} className="rounded-xl bg-cyan-950">{busy ? "處理中…" : consumable ? "確認已更換新品" : "確認補充"}</Button></DialogFooter></DialogContent></Dialog>; }

function FlowDialog({ open, setOpen, flow, products, submit, busy }: DialogProps & { flow: WashFlow | null; products: Product[] }) { const [flowType, setFlowType] = useState("自訂流程"), [name, setName] = useState(""), [items, setItems] = useState<Record<number, number>>({}), [order, setOrder] = useState<number[]>([]); useEffect(() => {
  if (!open) return;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setFlowType(flow?.flowType || "自訂流程");
  setName(flow?.flowType === "自訂流程" ? flow.name : "");
  setItems(Object.fromEntries((flow?.items || []).map((i) => [i.productId, i.amount])));
  setOrder((flow?.items || []).map((i) => i.productId));
}, [open, flow]); async function save() { const selected = new Set(Object.entries(items).filter(([, amount]) => amount > 0).map(([productId]) => Number(productId))); const ids = [...order.filter((id) => selected.has(id)), ...[...selected].filter((id) => !order.includes(id))]; const list = ids.map((productId) => ({ productId, amount: items[productId] })); try { await submit("saveFlow", { flowId: flow?.id, flowType, name, items: list }); setOpen(false); toast.success("流程設定已儲存"); } catch (e) { toast.error(msg(e)); } } return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{flow ? `編輯 ${flow.name}` : "新增自訂流程"}</DialogTitle><DialogDescription>設定流程名稱、預設藥劑與每次使用劑量；拖曳已選藥劑可調整使用順序。</DialogDescription></DialogHeader><div className="grid gap-4"><Field label="流程類型"><select disabled={!!flow && flow.flowType !== "自訂流程"} className={inputClass} value={flowType} onChange={(e) => setFlowType(e.target.value)}><option>2PH</option><option>3PH</option><option>快速保養</option><option>自訂流程</option></select></Field>{flowType === "自訂流程" && <Field label="流程名稱"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：雨後加強洗" /></Field>}<ProductPicker products={products} values={items} setValues={setItems} order={order} setOrder={setOrder} reorderable /></div><DialogFooter><Button disabled={busy} onClick={save} className="rounded-xl bg-cyan-950">{busy ? "儲存中…" : "儲存流程"}</Button></DialogFooter></DialogContent></Dialog>; }

function WashDialog({ open, setOpen, flows, products, submit, busy }: DialogProps & { flows: WashFlow[]; products: Product[] }) { const [step, setStep] = useState(1), [flowId, setFlowId] = useState<number | null>(null), [usages, setUsages] = useState<Record<number, number>>({}), [date, setDate] = useState(new Date().toISOString().slice(0, 10)), [note, setNote] = useState(""); const selectedFlow = flows.find((f) => f.id === flowId); function choose(flow: WashFlow) { setFlowId(flow.id); setUsages(Object.fromEntries(flow.items.map((i) => [i.productId, i.amount]))); } async function save() { if (!flowId || !selectedFlow) return; const list = selectedFlow.items.filter((item) => usages[item.productId] > 0).map((item) => ({ productId: item.productId, amount: usages[item.productId] })); try { await submit("logWash", { flowId, washedAt: date, note, usages: list }); setOpen(false); setStep(1); setFlowId(null); setUsages({}); setNote(""); toast.success("洗車完成，庫存已扣除"); } catch (e) { toast.error(msg(e)); } } return <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setStep(1); }}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>記錄本次洗車</DialogTitle><DialogDescription>步驟 {step} / 2　{step === 1 ? "選擇這次洗車流程" : "確認藥劑與使用劑量"}</DialogDescription></DialogHeader>{step === 1 ? <div className="grid gap-3">{flows.map((flow) => <button key={flow.id} disabled={!flow.items.length} onClick={() => choose(flow)} className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${flowId === flow.id ? "border-cyan-600 bg-cyan-50 ring-4 ring-cyan-600/10" : "border-slate-200 hover:border-cyan-300"}`}><div className="flex justify-between"><strong>{flow.name}</strong><span className="text-xs text-slate-400">{flow.items.length} 項藥劑</span></div><ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs text-slate-500">{flow.items.length ? flow.items.map((i) => <li key={i.productId}>{i.productName}</li>) : <li className="list-none">請先到流程管理設定藥劑</li>}</ol></button>)}<DialogFooter><Button disabled={!flowId} onClick={() => setStep(2)} className="rounded-xl bg-cyan-950">下一步：確認用量</Button></DialogFooter></div> : <div className="grid gap-4"><div className="rounded-2xl bg-cyan-950 p-4 text-white"><p className="text-xs text-cyan-200">本次流程</p><p className="mt-1 font-semibold">{selectedFlow?.name}</p></div><Field label="洗車日期"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><ProductPicker products={(selectedFlow?.items || []).map((item) => products.find((p) => p.id === item.productId)).filter((p): p is Product => !!p)} values={usages} setValues={setUsages} locked /><Field label="備註（選填）"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field><DialogFooter><Button variant="outline" onClick={() => setStep(1)} className="rounded-xl">上一步</Button><Button disabled={busy} onClick={save} className="rounded-xl bg-cyan-950">{busy ? "扣除中…" : "確認並扣除庫存"}</Button></DialogFooter></div>}</DialogContent></Dialog>; }

function ProductPicker({ products, values, setValues, locked = false, order = [], setOrder, reorderable = false }: { products: Product[]; values: Record<number, number>; setValues: (v: Record<number, number>) => void; locked?: boolean; order?: number[]; setOrder?: (v: number[]) => void; reorderable?: boolean }) { const [dragging, setDragging] = useState<number | null>(null); const selectedIds = order.filter((id) => values[id] !== undefined); const sorted = reorderable ? [...selectedIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p), ...products.filter((p) => values[p.id] === undefined)] : products; function toggle(id: number, enabled: boolean) { const next = { ...values }; if (enabled) { next[id] = 1; setOrder?.([...selectedIds, id]); } else { delete next[id]; setOrder?.(selectedIds.filter((item) => item !== id)); } setValues(next); } function move(targetId: number) { if (dragging === null || dragging === targetId || !setOrder) return; const next = selectedIds.filter((id) => id !== dragging); next.splice(next.indexOf(targetId), 0, dragging); setOrder(next); } return <div className="grid gap-2">{sorted.map((p) => { const checked = values[p.id] !== undefined, position = selectedIds.indexOf(p.id); return <div key={p.id} data-picker-row onDragOver={(e) => { if (reorderable && checked && dragging !== null) e.preventDefault(); }} onDrop={() => move(p.id)} className={`grid grid-cols-[auto_minmax(0,1fr)_130px] items-center gap-3 rounded-2xl border p-3 ${checked ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"} ${dragging === p.id ? "opacity-50" : ""}`}>{reorderable ? <div className="flex items-center gap-1.5">{checked && <><span draggable onDragStart={(e) => { e.stopPropagation(); const row = e.currentTarget.closest("[data-picker-row]"); if (row instanceof HTMLElement) e.dataTransfer.setDragImage(row, 24, row.offsetHeight / 2); e.dataTransfer.effectAllowed = "move"; setDragging(p.id); }} onDragEnd={() => setDragging(null)} className="cursor-grab active:cursor-grabbing" title="拖曳調整順序" aria-label={`拖曳 ${p.name} 調整順序`}><GripVertical className="size-4 text-cyan-800" /></span><span className="grid size-5 place-items-center rounded-full bg-cyan-800 text-[11px] font-bold text-white">{position + 1}</span></>}<Checkbox checked={checked} onCheckedChange={(v) => toggle(p.id, !!v)} /></div> : locked ? <Beaker className="size-4 text-cyan-700" /> : <Checkbox checked={checked} onCheckedChange={(v) => toggle(p.id, !!v)} />}<div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{p.name}</p><p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">品牌：{p.brand || "未設定品牌"}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">{p.category}</span>{p.category !== "耗材" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${phClass(p.phType)}`}>{p.phType}</span>}<span className="text-xs text-slate-500">庫存 {format(p.remaining)} {p.unit}</span></div></div><label className="grid gap-1"><span className="text-xs font-medium text-slate-600">每次使用</span><div className="relative"><input aria-label={`${p.name} 每次使用`} className={`${inputClass} pr-9`} disabled={!checked} type="number" inputMode="numeric" min="1" max={p.remaining} step="1" value={checked ? values[p.id] : ""} onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.currentTarget.select()} onChange={(e) => setValues({ ...values, [p.id]: Number(e.target.value) })} /><span className="absolute right-3 top-3 text-xs font-medium text-slate-500">{p.unit}</span></div></label></div>; })}</div>; }

function DeleteProductDialog({ product, setProduct, submit, busy }: { product: Product | null; setProduct: (v: Product | null) => void; submit: Submit; busy: boolean }) { const flows = product?.affectedFlowNames?.split(",").filter(Boolean) || []; async function remove() { if (!product) return; try { await submit("deleteProduct", { productId: product.id }); setProduct(null); toast.success("用品已從庫存與相關流程移除"); } catch (e) { toast.error(msg(e)); } } return <AlertDialog open={!!product} onOpenChange={(v) => !v && setProduct(null)}><AlertDialogContent className="rounded-3xl"><AlertDialogHeader><AlertDialogTitle>確認移除「{product?.name}」？</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3"><p>用品會從庫存列表移除，過去洗車紀錄會完整保留。</p>{flows.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-amber-900"><strong>也會從以下流程範本移除：</strong><p className="mt-1">{flows.join("、")}</p></div>}</div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction disabled={busy} variant="destructive" onClick={remove}>{busy ? "移除中…" : "確認移除"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }

type BackupFile = { format: string; version: number; exportedAt?: string; data: { products?: unknown[]; flows?: unknown[]; flowItems?: unknown[]; washes?: unknown[]; washUsages?: unknown[]; restocks?: unknown[] } };

function BackupPanel({ submit, busy }: { submit: Submit; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null), [backup, setBackup] = useState<BackupFile | null>(null), [confirmOpen, setConfirmOpen] = useState(false), [exporting, setExporting] = useState(false);
  const counts = backup ? { products: backup.data.products?.length || 0, flows: backup.data.flows?.length || 0, washes: backup.data.washes?.length || 0, restocks: backup.data.restocks?.length || 0 } : null;
  async function download() { setExporting(true); const toastId = toast.loading("正在整理備份…"); try { const response = await fetch("/api/inventory?export=1", { cache: "no-store" }); if (!response.ok) throw new Error("匯出失敗"); const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `car-care-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); toast.success("備份已下載", { id: toastId }); } catch (e) { toast.error(msg(e), { id: toastId }); } finally { setExporting(false); } }
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { if (file.size > 5 * 1024 * 1024) throw new Error("備份檔不可超過 5 MB"); const parsed = JSON.parse(await file.text()) as BackupFile; if (parsed?.format !== "car-care-inventory-backup" || parsed?.version !== 1 || !parsed.data) throw new Error("這不是支援的洗車用品備份檔"); setBackup(parsed); } catch (e) { setBackup(null); toast.error(msg(e)); } }
  async function restore() { if (!backup) return; try { await submit("importBackup", { backup }); setBackup(null); setConfirmOpen(false); toast.success("資料已完整還原"); } catch (e) { toast.error(msg(e)); } }
  return <section className="grid gap-5 lg:grid-cols-2"><article className="rounded-[28px] border border-white bg-white p-6 shadow-sm"><div className="grid size-11 place-items-center rounded-2xl bg-cyan-50 text-cyan-800"><Download className="size-5" /></div><h2 className="mt-5 text-lg font-semibold">匯出完整備份</h2><p className="mt-2 text-sm leading-6 text-slate-600">下載目前帳號的用品、流程順序與用量、洗車紀錄及補貨紀錄。備份不包含登入資料，也不會包含其他使用者的內容。</p><Button disabled={busy || exporting} onClick={download} className="mt-6 rounded-xl bg-cyan-950">{exporting ? "匯出中…" : <><Download className="size-4" />下載 JSON 備份</>}</Button></article><article className="rounded-[28px] border border-white bg-white p-6 shadow-sm"><div className="grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-800"><Upload className="size-5" /></div><h2 className="mt-5 text-lg font-semibold">匯入並完整還原</h2><p className="mt-2 text-sm leading-6 text-slate-600">選擇本站匯出的 JSON。確認後會以備份內容覆蓋目前帳號的資料，其他帳號完全不受影響。</p><input ref={inputRef} type="file" accept="application/json,.json" onChange={chooseFile} className="hidden" />{counts ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">備份內容已讀取</p><p className="mt-1 text-xs leading-5 text-amber-800">{counts.products} 項用品 · {counts.flows} 個流程 · {counts.washes} 筆洗車 · {counts.restocks} 筆補貨</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-xl">重選檔案</Button><Button disabled={busy} onClick={() => setConfirmOpen(true)} className="rounded-xl bg-amber-700 hover:bg-amber-800">開始匯入</Button></div></div> : <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="mt-6 rounded-xl"><Upload className="size-4" />選擇備份檔</Button>}</article><AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent className="rounded-3xl"><AlertDialogHeader><AlertDialogTitle>確定覆蓋目前帳號的資料？</AlertDialogTitle><AlertDialogDescription>目前帳號內的用品、流程、洗車與補貨紀錄會先被清除，再完整還原選擇的備份。這個操作無法復原。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction disabled={busy} variant="destructive" onClick={restore}>{busy ? "匯入中…" : "確認覆蓋並匯入"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></section>;
}

function HistoryList({ washes }: { washes: Wash[] }) { return <section className="rounded-[28px] border border-white bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-slate-100"><History className="size-4" /></div><div><h2 className="font-semibold">最近洗車紀錄</h2><p className="text-sm text-slate-500">保留流程、藥劑與實際用量</p></div></div>{washes.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">還沒有洗車紀錄</p> : <div className="mt-5 divide-y divide-slate-100">{washes.map((w) => <div key={w.id} className="grid gap-2 py-4 sm:grid-cols-[130px_1fr]"><time className="text-sm font-medium">{new Date(w.washedAt + "T00:00:00").toLocaleDateString("zh-TW")}</time><div><p className="text-sm font-semibold text-cyan-900">{w.flowName || "舊版洗車紀錄"}</p>{w.items?.length ? <ul className="mt-2 max-w-xl space-y-1.5 text-sm text-slate-700">{w.items.map((item, index) => <li key={`${item.name}-${index}`} className="grid grid-cols-[8px_auto_auto_minmax(80px,1fr)_72px] items-center gap-1.5"><span className="size-1 rounded-full bg-slate-700" aria-hidden="true" /><span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{item.category}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${phClass(item.phType)}`}>{item.phType}</span><span className="min-w-0 truncate">{item.name}</span><span className="whitespace-nowrap text-right font-medium tabular-nums">{format(item.amount)} {item.unit}</span></li>)}</ul> : w.summary && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{w.summary.split("、").map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}{w.note && <p className="mt-2 text-xs text-slate-500">備註：{w.note}</p>}</div></div>)}</div>}</section>; }
function Metric({ icon, value, suffix, label, tone = "neutral" }: { icon: React.ReactNode; value: number | string; suffix?: string; label: string; tone?: "neutral" | "success" | "warning" | "danger" }) { const style = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-white bg-white"; return <div className={`rounded-[28px] border p-6 shadow-sm ${style}`}><div className="size-5">{icon}</div><p className="mt-6 text-3xl font-semibold tabular-nums">{value}{suffix && <span className="ml-1 text-base">{suffix}</span>}</p><p className={`mt-1 text-sm ${tone === "neutral" ? "text-slate-500" : "text-current/75"}`}>{label}</p></div>; }
function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold tracking-[.16em] text-cyan-700">{eyebrow}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2></div>{children}</div>; }
function EmptyState({ onAdd }: { onAdd: () => void }) { return <div className="rounded-[28px] border border-dashed border-cyan-200 bg-white/70 px-6 py-14 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-cyan-100 text-cyan-800"><PackagePlus /></div><h3 className="mt-4 font-semibold">先加入第一項洗車用品</h3><Button onClick={onAdd} className="mt-5 rounded-xl bg-cyan-950"><Plus />新增用品</Button></div>; }
function Loading() { return <div className="rounded-3xl bg-white p-8 text-sm text-slate-500">正在整理庫存…</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>; }
function NumberInput(props: React.ComponentProps<"input">) { return <input {...props} className={inputClass} type="number" min="1" step="1" required />; }
function format(value: number) { return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 }).format(value); }
function daysSince(date: string) { const [year, month, day] = date.split("-").map(Number); const washed = new Date(year, month - 1, day); const today = new Date(); today.setHours(0, 0, 0, 0); return Math.max(0, Math.floor((today.getTime() - washed.getTime()) / 86400000)); }
function msg(error: unknown) { return error instanceof Error ? error.message : "操作失敗"; }
function phClass(ph: Product["phType"]) { return ph === "酸性" ? "bg-rose-50 text-rose-700" : ph === "鹼性" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"; }
type DialogProps = { open: boolean; setOpen: (v: boolean) => void; submit: Submit; busy: boolean };
