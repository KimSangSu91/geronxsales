"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { purchaseTotal } from "@/lib/billing";
import { formatDate } from "@/lib/date";
import { DEVICE_KIND_LABEL, OPTION_CATEGORY_LABEL } from "@/lib/labels";
import { formatWon } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useOptionEditor } from "../contract/option-editor";
import { updateDeviceQty } from "./actions";
import type { DevicesTabData, KindKey, QtyInput } from "./devices-shared";

const CONTRACT_KEY = { BAND: "band", HUB: "hub", CHARGER: "charger" } as const;
const TRIAL_KEY = { BAND: "band", HUB: "hub", CHARGER: "charger", ADAPTER: "adapter" } as const;
const n = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : 0);

// 장비 탭 (화면정의서 4-6, 1차 = 제공 수량만)
export function DevicesTab({ customerId, data, today }: { customerId: string; data: DevicesTabData; today: string }) {
  const router = useRouter();
  const options = useOptionEditor({ customerId, rows: data.options, today });

  const initial = (): QtyInput => ({
    contract: data.contract
      ? {
          hub: String(data.rows.find((r) => r.kind === "HUB")?.contract ?? 0),
          band: String(data.rows.find((r) => r.kind === "BAND")?.contract ?? 0),
          charger: String(data.rows.find((r) => r.kind === "CHARGER")?.contract ?? 0),
        }
      : null,
    trial: data.trial
      ? {
          hub: String(data.trial.qtyHub),
          band: String(data.trial.qtyBand),
          charger: String(data.trial.qtyCharger),
          adapter: String(data.trial.qtyAdapter),
        }
      : null,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<QtyInput>(initial);
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const dirty = editing && JSON.stringify(form) !== JSON.stringify(initial());
  useUnsavedChanges("device-qty", dirty);

  // 계약 수량을 바꾸면 금액이 바뀜 → 미리 보여줌
  const priceText = (q: { hub: number; band: number; charger: number }) => {
    const c = data.contract!;
    return c.contractType === "SUBSCRIPTION"
      ? `월 구독료 ${formatWon(q.band * (c.unitPriceBand ?? 0))}원`
      : `구축 총액 ${formatWon(purchaseTotal({ qtyHub: q.hub, qtyBand: q.band, qtyCharger: q.charger, ...c }))}원`;
  };
  const before = data.contract && initial().contract;
  const pricePreview =
    editing && data.contract && form.contract && before
      ? (() => {
          const a = priceText({ hub: n(before.hub), band: n(before.band), charger: n(before.charger) });
          const b = priceText({ hub: n(form.contract.hub), band: n(form.contract.band), charger: n(form.contract.charger) });
          return a === b ? null : `${a} → ${b.replace(/^[^0-9]*/, "")}`;
        })()
      : null;

  const save = () =>
    startTransition(async () => {
      const r = await updateDeviceQty(customerId, { contract: data.contract?.version, trial: data.trial?.version }, form);
      if (r.ok) {
        toast.success("장비 수량을 저장했습니다");
        setEditing(false);
        setMessage(undefined);
      } else {
        setMessage(r.message);
        if (r.conflict) router.refresh();
      }
    });

  const total = (r: DevicesTabData["rows"][number]) => {
    if (!editing) return (r.contract ?? 0) + r.extra + r.trial;
    const c = r.kind !== "ADAPTER" && form.contract ? n(form.contract[CONTRACT_KEY[r.kind]]) : (r.contract ?? 0);
    // 체험 제공 = 수정 중인 진행 체험 + 그 외 미전환 체험
    const editableNow = data.trial ? n(form.trial![TRIAL_KEY[r.kind]]) : 0;
    const editableBefore = data.trial ? (r.kind === "BAND" ? data.trial.qtyBand : r.kind === "HUB" ? data.trial.qtyHub : r.kind === "CHARGER" ? data.trial.qtyCharger : data.trial.qtyAdapter) : 0;
    return c + r.extra + r.trial - editableBefore + editableNow;
  };

  const th = "px-2 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5";
  const td = "px-2 py-2.5 align-middle tabular-nums first:pl-5 last:pr-5";
  const numInput = (value: string, onChange: (v: string) => void) => (
    <Input inputMode="numeric" className="h-7 w-20" value={value} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">제공 장비 수량</h3>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!data.contract && !data.trial}
              title={!data.contract && !data.trial ? "계약 또는 진행 중인 체험이 있어야 수정할 수 있습니다" : undefined}
              onClick={() => {
                setForm(initial());
                setMessage(undefined);
                setEditing(true);
              }}
            >
              <Pencil />
              수량 수정
            </Button>
          )}
        </div>
        <table className="w-full table-fixed text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className={th}>기기</th>
              <th className={th}>계약 제공</th>
              <th className={th}>추가 제공</th>
              <th className={th}>체험 제공</th>
              <th className={th}>합계</th>
              <th className={th}>회수</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.kind} className="border-b last:border-0">
                <td className={cn(td, "font-medium")}>{DEVICE_KIND_LABEL[r.kind as KindKey]}</td>
                <td className={td}>
                  {r.kind === "ADAPTER" ? (
                    <span className="text-muted-foreground" title="계약에는 어댑터가 없습니다">-</span>
                  ) : editing && form.contract ? (
                    numInput(form.contract[CONTRACT_KEY[r.kind]], (v) =>
                      setForm((f) => ({ ...f, contract: { ...f.contract!, [CONTRACT_KEY[r.kind as "BAND"]]: v } })),
                    )
                  ) : (
                    (r.contract ?? 0)
                  )}
                </td>
                <td className={td}>
                  <span title="계약·비용 탭 > 추가 기기 제공에서 관리">{r.extra}</span>
                </td>
                <td className={td}>
                  {editing && form.trial
                    ? numInput(form.trial[TRIAL_KEY[r.kind]], (v) =>
                        setForm((f) => ({ ...f, trial: { ...f.trial!, [TRIAL_KEY[r.kind]]: v } })),
                      )
                    : r.trial}
                </td>
                <td className={cn(td, "font-semibold")}>{total(r)}</td>
                <td className={td}>{r.recovered ?? <span className="text-muted-foreground">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <div className="mr-auto flex flex-col text-xs">
              {pricePreview && <span className="font-medium text-orange-700">계약 금액이 바뀝니다: {pricePreview}</span>}
              <span className="text-muted-foreground">
                추가 제공은 계약·비용 탭 &gt; 추가 기기 제공에서 관리합니다.
              </span>
              {message && <span className="text-destructive">{message}</span>}
            </div>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              취소
            </Button>
            <Button onClick={save} disabled={pending || !dirty}>
              {pending && <Loader2 className="animate-spin" />}
              저장
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">
            옵션상품 <span className="text-sm font-normal text-muted-foreground">{data.options.length}건</span>
          </h3>
          <Button variant="ghost" size="sm" onClick={() => options.open()}>
            <Plus />
            옵션상품 추가
          </Button>
        </div>
        {data.options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">등록된 옵션상품이 없습니다</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className={th}>구분</th>
                <th className={th}>제품명·모델</th>
                <th className={th}>수량</th>
                <th className={th}>제공일</th>
                <th className={th}>회수</th>
              </tr>
            </thead>
            <tbody>
              {data.options.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className={cn(td, "truncate font-medium")}>
                    {o.input.category === "OTHER" ? o.input.categoryOther || "기타" : o.input.category ? OPTION_CATEGORY_LABEL[o.input.category] : "-"}
                  </td>
                  <td className={cn(td, "truncate")} title={o.input.productName}>
                    {o.input.productName}
                  </td>
                  <td className={td}>{o.input.qty}</td>
                  <td className={td}>{formatDate(o.providedOn)}</td>
                  <td className={td}>{o.recovered ?? <span className="text-muted-foreground">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
          금액·수정·삭제는{" "}
          <Link href={`/customers/${customerId}?tab=contract`} className="underline underline-offset-4">
            계약·비용 탭
          </Link>
          에서 관리합니다. 어느 탭에서 추가해도 양쪽에 표시됩니다.
        </p>
      </section>
      {options.dialog}
    </div>
  );
}
