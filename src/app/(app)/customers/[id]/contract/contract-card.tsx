"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConflictDialog } from "@/components/conflict-dialog";
import { DatePicker } from "@/components/date-picker";
import { Field, textareaClass } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import { MonthPicker } from "@/components/month-picker";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { addMonthsYm, installmentAmount, purchaseTotal } from "@/lib/billing";
import { AUTO_RENEW_PRESETS, emptyContract, parseAmount, validateContract, type ContractInput } from "@/lib/contract-input";
import type { FieldErrors } from "@/lib/customer-input";
import { addDays, addMonths, dDayLabel, formatDate } from "@/lib/date";
import { CONTRACT_TYPE_LABEL, PURCHASE_PAYMENT_LABEL } from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AlertBadge } from "@/components/alert-badge";
import type { BadgeKind } from "@/lib/renewal";
import { createContract, updateContract, type Conflict } from "./actions";
import { RenewalDialog } from "./renewal-dialog";
import type { ContractView } from "./contract-shared";

const LABELS: Partial<Record<keyof ContractInput, string>> = {
  contractDate: "계약일",
  startDate: "시작일",
  endDate: "종료일",
  contractUsers: "계약 인원",
  autoRenew: "자동연장",
  autoRenewMonths: "연장 기간(개월)",
  qtyHub: "허브",
  qtyBand: "밴드",
  qtyCharger: "충전기",
  contractType: "유형",
  joinFee: "가입비",
  unitPriceHub: "허브 단가",
  unitPriceBand: "밴드 단가",
  unitPriceCharger: "충전기 단가",
  purchasePayment: "납부",
  purchaseBillingMonth: "청구·분납 시작월",
  installmentMonths: "분납 개월",
  managementFee: "월 관리비",
  managementFeeStart: "관리비 시작월",
  memo: "메모",
};
const show = (k: keyof ContractInput, v: unknown) => {
  const s = String(v ?? "");
  if (!s) return "-";
  if (k === "contractDate" || k === "startDate" || k === "endDate") return formatDate(s);
  if (k === "contractType") return CONTRACT_TYPE_LABEL[s as "PURCHASE"];
  if (k === "purchasePayment") return PURCHASE_PAYMENT_LABEL[s as "LUMP_SUM"];
  if (k === "autoRenew") return s === "yes" ? "Y" : "N";
  if (k === "purchaseBillingMonth" || k === "managementFeeStart") return s.replace("-", ".");
  return s;
};

const QTY = [
  ["qtyHub", "unitPriceHub", "허브"],
  ["qtyBand", "unitPriceBand", "밴드"],
  ["qtyCharger", "unitPriceCharger", "충전기"],
] as const;

const num = (v: string) => (v.trim() ? Number(v) : 0);
const price = (v: string) => {
  const n = parseAmount(v);
  return Number.isNaN(n) ? 0 : n;
};
const renewText = (m: string) => {
  const n = Number(m);
  return n % 12 === 0 ? `${n / 12}년` : `${n}개월`;
};

// 입력값 → 계산된 금액 (화면 표시용)
function amounts(c: ContractInput) {
  const p = {
    qtyHub: num(c.qtyHub),
    qtyBand: num(c.qtyBand),
    qtyCharger: num(c.qtyCharger),
    unitPriceHub: price(c.unitPriceHub),
    unitPriceBand: price(c.unitPriceBand),
    unitPriceCharger: price(c.unitPriceCharger),
  };
  const total = purchaseTotal(p);
  const months = num(c.installmentMonths);
  return {
    purchaseTotal: total,
    installment: months >= 2 ? installmentAmount(total, months) : null,
    subscription: p.qtyBand * p.unitPriceBand,
  };
}

const Won = ({ v, suffix = "" }: { v: number; suffix?: string }) => (
  <span className="tabular-nums">
    <b>{formatWon(v)}원</b>
    {suffix}
    <span className="ml-1 text-xs text-muted-foreground">VAT {formatWon(withVat(v))}원</span>
  </span>
);

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex gap-3", wide && "md:col-span-3")}>
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function ContractSummary({ contract, today }: { contract: ContractView; today: string }) {
  const c = contract.input;
  const a = amounts(c);
  const purchase = c.contractType === "PURCHASE";
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
      <Item label="계약일">{formatDate(c.contractDate)}</Item>
      <Item label="기간">
        <span className="tabular-nums">
          {formatDate(c.startDate)} ~ {formatDate(c.endDate)}{" "}
          {contract.state === "CURRENT" && <span className="text-xs text-muted-foreground">({dDayLabel(c.endDate, today)})</span>}
        </span>
      </Item>
      <Item label="계약 인원">{c.contractUsers}명</Item>
      <Item label="자동연장">{c.autoRenew === "yes" ? `Y · ${renewText(c.autoRenewMonths)}씩 연장` : "N"}</Item>
      <Item label="유형">
        <span className="font-medium">{CONTRACT_TYPE_LABEL[c.contractType]}</span>
      </Item>
      <Item label="제공 장비">
        {QTY.map(([q, , l]) => `${l} ${c[q] || 0}`).join(" · ")}
      </Item>
      {purchase ? (
        <>
          <Item label="장비 단가" wide>
            {QTY.filter(([q]) => num(c[q]) > 0)
              .map(([q, p, l]) => `${l} ${formatWon(price(c[p]))}원 × ${c[q]}`)
              .join(" · ")}
          </Item>
          <Item label="구축 총액" wide>
            <Won v={a.purchaseTotal} />
            <span className="ml-2 text-muted-foreground">
              {c.purchasePayment === "INSTALLMENT"
                ? `분납 ${c.installmentMonths}개월 (${c.purchaseBillingMonth.replace("-", ".")}~${addMonthsYm(c.purchaseBillingMonth, num(c.installmentMonths) - 1).replace("-", ".")}) · 월 ${formatWon(a.installment ?? 0)}원`
                : `일시납 · 청구 ${c.purchaseBillingMonth.replace("-", ".")}`}
            </span>
          </Item>
        </>
      ) : (
        <Item label="월 구독료" wide>
          <Won v={a.subscription} suffix=" /월" />
          <span className="ml-2 text-muted-foreground">
            밴드 {c.qtyBand} × {formatWon(price(c.unitPriceBand))}원
          </span>
        </Item>
      )}
      <Item label="가입비" wide>
        {c.joinFee ? (
          <>
            <Won v={price(c.joinFee)} />
            <span className="ml-2 text-muted-foreground">1회 · 청구 {c.startDate.slice(0, 7).replace("-", ".")} (계약 시작월)</span>
          </>
        ) : (
          <span className="text-muted-foreground">없음</span>
        )}
      </Item>
      <Item label="월 관리비" wide>
        {c.managementFee ? (
          <>
            <Won v={price(c.managementFee)} suffix=" /월" />
            <span className="ml-2 text-muted-foreground">{c.managementFeeStart.replace("-", ".")}부터</span>
          </>
        ) : (
          <span className="text-muted-foreground">없음</span>
        )}
      </Item>
      {c.memo && (
        <Item label="메모" wide>
          <span className="whitespace-pre-wrap">{c.memo}</span>
        </Item>
      )}
    </dl>
  );
}

// 계약 등록·수정·갱신(변경 있음) 폼 본문
export function ContractForm({
  form,
  set,
  errors,
}: {
  form: ContractInput;
  set: (patch: Partial<ContractInput>) => void;
  errors: FieldErrors;
}) {
  const a = amounts(form);
  const purchase = form.contractType === "PURCHASE";
  const customRenew = !AUTO_RENEW_PRESETS.includes(Number(form.autoRenewMonths));
  const [renewCustom, setRenewCustom] = useState(customRenew && !!form.autoRenewMonths);
  const startYm = form.startDate ? form.startDate.slice(0, 7) : "";

  return (
    <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
      {/* ① 기본 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="계약일" required error={errors.contractDate}>
          <DatePicker value={form.contractDate || undefined} onChange={(v) => set({ contractDate: v ?? "" })} />
        </Field>
        <Field label="시작일" required error={errors.startDate}>
          <DatePicker value={form.startDate || undefined} onChange={(v) => set({ startDate: v ?? "" })} />
        </Field>
        <Field label="종료일" required error={errors.endDate}>
          <DatePicker value={form.endDate || undefined} onChange={(v) => set({ endDate: v ?? "" })} />
        </Field>
        <div className="flex items-center gap-1.5 sm:col-span-3">
          <span className="text-xs text-muted-foreground">기간</span>
          {[12, 24].map((m) => (
            <button
              key={m}
              type="button"
              disabled={!form.startDate}
              onClick={() => set({ endDate: addDays(addMonths(form.startDate, m), -1) })}
              className="rounded-full border px-3 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
            >
              시작일부터 {m / 12}년
            </button>
          ))}
        </div>
        <Field label="계약 인원" required error={errors.contractUsers}>
          <Input inputMode="numeric" value={form.contractUsers} onChange={(e) => set({ contractUsers: e.target.value })} placeholder="명" aria-invalid={!!errors.contractUsers} />
        </Field>
        <Field label="자동연장" required error={errors.autoRenew ?? errors.autoRenewMonths} className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => set({ autoRenew: "no" })}
              className={cn("rounded-full border px-3 py-0.5 text-xs", form.autoRenew === "no" ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              연장 안 함
            </button>
            {AUTO_RENEW_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setRenewCustom(false);
                  set({ autoRenew: "yes", autoRenewMonths: String(m) });
                }}
                className={cn(
                  "rounded-full border px-3 py-0.5 text-xs",
                  form.autoRenew === "yes" && !renewCustom && Number(form.autoRenewMonths) === m
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted",
                )}
              >
                {renewText(String(m))}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setRenewCustom(true);
                set({ autoRenew: "yes" });
              }}
              className={cn("rounded-full border px-3 py-0.5 text-xs", form.autoRenew === "yes" && renewCustom ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              직접입력
            </button>
            {form.autoRenew === "yes" && renewCustom && (
              <span className="flex items-center gap-1 text-xs">
                <Input className="h-7 w-16" inputMode="numeric" value={form.autoRenewMonths} onChange={(e) => set({ autoRenewMonths: e.target.value })} />
                개월
              </span>
            )}
          </div>
        </Field>
      </div>

      {/* ② 유형 + ③ 제공 수량·단가 */}
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">계약 유형</span>
          {(["SUBSCRIPTION", "PURCHASE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ contractType: t })}
              className={cn("rounded-md border px-3 py-1 text-sm", form.contractType === t ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              {CONTRACT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 font-medium">장비</th>
              <th className="w-24 pb-1 font-medium">제공 수량</th>
              <th className="pb-1 font-medium">{purchase ? "단가 (공급가)" : "월 단가 (공급가)"}</th>
            </tr>
          </thead>
          <tbody>
            {QTY.map(([q, p, l]) => (
              <tr key={q} className="align-top">
                <td className="py-1 pr-2">{l}</td>
                <td className="py-1 pr-2">
                  <Input inputMode="numeric" value={form[q]} onChange={(e) => set({ [q]: e.target.value })} placeholder="0" aria-invalid={!!errors[q]} />
                </td>
                <td className="py-1">
                  {purchase || q === "qtyBand" ? (
                    <MoneyInput value={form[p]} onChange={(v) => set({ [p]: v })} invalid={!!errors[p]} />
                  ) : (
                    <span className="text-xs text-muted-foreground">구독형은 밴드만 과금</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(errors.qty || errors.qtyBand || errors.unitPriceBand || errors.unitPriceHub || errors.unitPriceCharger) && (
          <p className="text-xs text-destructive">
            {errors.qty ?? errors.qtyBand ?? errors.unitPriceBand ?? errors.unitPriceHub ?? errors.unitPriceCharger}
          </p>
        )}

        {/* ④ 금액·납부 */}
        {purchase ? (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-sm">
              구축 총액 <Won v={a.purchaseTotal} />
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="납부" required error={errors.purchasePayment}>
                <div className="flex gap-1">
                  {(["LUMP_SUM", "INSTALLMENT"] as const).map((pp) => (
                    <button
                      key={pp}
                      type="button"
                      onClick={() => set({ purchasePayment: pp })}
                      className={cn("flex-1 rounded-md border px-2 py-1 text-sm", form.purchasePayment === pp ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
                    >
                      {PURCHASE_PAYMENT_LABEL[pp]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={form.purchasePayment === "INSTALLMENT" ? "분납 시작월" : "청구월"} required error={errors.purchaseBillingMonth}>
                <MonthPicker
                  value={form.purchaseBillingMonth || undefined}
                  onChange={(v) => set({ purchaseBillingMonth: v ?? "" })}
                  invalid={!!errors.purchaseBillingMonth}
                />
              </Field>
              {form.purchasePayment === "INSTALLMENT" && (
                <Field label="분납 개월 수" required error={errors.installmentMonths}>
                  <Input inputMode="numeric" value={form.installmentMonths} onChange={(e) => set({ installmentMonths: e.target.value })} placeholder="개월" aria-invalid={!!errors.installmentMonths} />
                </Field>
              )}
            </div>
            {form.purchasePayment === "INSTALLMENT" && a.installment !== null && (
              <p className="text-xs text-muted-foreground">
                월 분납액 {formatWon(a.installment)}원 (원 단위 내림, 남는 금액은 마지막 회차에 포함)
              </p>
            )}
          </div>
        ) : (
          <p className="border-t pt-3 text-sm">
            월 구독료 <Won v={a.subscription} suffix=" /월" />
            <span className="ml-1 text-xs text-muted-foreground">(밴드 수 × 밴드 월 단가, 계약 기간 동안 매월)</span>
          </p>
        )}
      </div>

      {/* ⑤ 가입비 · 관리비 (두 유형 공통) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="가입비 (선택)"
          error={errors.joinFee}
          hint={<span className="text-xs text-muted-foreground">1회성 · 계약 시작월(첫 달)에만 청구</span>}
        >
          <MoneyInput value={form.joinFee} onChange={(v) => set({ joinFee: v })} invalid={!!errors.joinFee} />
        </Field>
        <div />
        <Field label="월 관리비 (선택)" error={errors.managementFee} hint={<span className="text-xs text-muted-foreground">없으면 비워 두세요</span>}>
          <MoneyInput value={form.managementFee} onChange={(v) => set({ managementFee: v, managementFeeStart: form.managementFeeStart || startYm })} invalid={!!errors.managementFee} />
        </Field>
        <Field label="관리비 청구 시작월" required={price(form.managementFee) > 0} error={errors.managementFeeStart}>
          <MonthPicker value={form.managementFeeStart || undefined} onChange={(v) => set({ managementFeeStart: v ?? "" })} invalid={!!errors.managementFeeStart} />
          {startYm && (
            <div className="flex flex-wrap items-center gap-1">
              {[0, 6, 12, 24].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ managementFeeStart: addMonthsYm(startYm, m) })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    form.managementFeeStart === addMonthsYm(startYm, m) ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  )}
                >
                  {m === 0 ? "계약 시작월" : m % 12 === 0 ? `${m / 12}년 후` : `${m}개월 후`}
                </button>
              ))}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                계약 시작
                <Input
                  className="h-6 w-12 px-1 text-xs"
                  inputMode="numeric"
                  placeholder="n"
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    if (/^d+$/.test(e.target.value) && m <= 120) set({ managementFeeStart: addMonthsYm(startYm, m) });
                  }}
                />
                개월 후
              </span>
            </div>
          )}
          {!startYm && <span className="text-xs text-muted-foreground">계약 시작일을 먼저 고르면 빠른 선택 버튼이 나옵니다</span>}
        </Field>
      </div>

      <Field label="메모">
        <textarea className={textareaClass} rows={2} value={form.memo} onChange={(e) => set({ memo: e.target.value })} />
      </Field>
    </div>
  );
}

export function ContractCard({
  customerId,
  contract,
  excelNote,
  today,
  badge,
  openRenewal = false,
}: {
  customerId: string;
  contract: ContractView | null;
  excelNote: string | null;
  today: string;
  badge: BadgeKind | null; // 갱신 배지
  openRenewal?: boolean; // 배너·배지에서 바로 갱신 창 열기
}) {
  const [renewing, setRenewing] = useState(openRenewal && !!contract);
  const [editing, setEditing] = useState<{ version?: number; base: ContractInput } | null>(null);
  const [form, setForm] = useState<ContractInput>(emptyContract());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<Conflict<ContractInput> | null>(null);
  const [pending, startTransition] = useTransition();

  useUnsavedChanges("contract", !!editing && JSON.stringify(form) !== JSON.stringify(editing.base));

  const open = () => {
    const base = contract
      ? contract.input
      : { ...emptyContract(), contractDate: today, startDate: today, purchaseBillingMonth: today.slice(0, 7) };
    setEditing({ version: contract?.version, base });
    setForm(base);
    setErrors({});
    setMessage(undefined);
  };

  const save = () => {
    const found = validateContract(form);
    setErrors(found);
    if (Object.keys(found).length) return setMessage("입력 내용을 확인하세요.");
    startTransition(async () => {
      const r = contract ? await updateContract(contract.id, editing!.version!, form) : await createContract(customerId, form);
      if (r.ok) {
        setEditing(null);
        toast.success(contract ? "계약을 수정했습니다" : "계약을 등록했습니다");
        return;
      }
      if (r.conflict) return setConflict(r.conflict as Conflict<ContractInput>);
      setErrors(r.errors ?? {});
      setMessage(r.message);
    });
  };

  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="flex items-center gap-2 font-semibold">
          계약 내용
          {badge && <AlertBadge kind={badge} onClick={() => setRenewing(true)} />}
        </h3>
        <div className="flex gap-1">
          {contract && (
            <Button variant="ghost" size="sm" onClick={open}>
              <Pencil />
              수정
            </Button>
          )}
          {/* [계약 갱신]은 항상 노출, 배지 상태일 때 강조 (화면정의서 4-2) */}
          <Button
            variant={badge ? "default" : "ghost"}
            size="sm"
            disabled={!contract}
            title={contract ? undefined : "계약을 먼저 등록하세요"}
            onClick={() => setRenewing(true)}
          >
            <RefreshCw />
            계약 갱신
          </Button>
        </div>
      </div>
      <div className="px-5 py-4">
        {contract ? (
          <ContractSummary contract={contract} today={today} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
            <FileText className="size-6" />
            <p>등록된 계약이 없습니다</p>
            {excelNote && <p className="rounded-md bg-muted px-3 py-1.5 text-xs">엑셀 이관 정보: {excelNote}</p>}
            <Button onClick={open}>계약 등록</Button>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{contract ? "계약 수정" : "계약 등록"}</DialogTitle>
          </DialogHeader>
          {!contract && excelNote && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">참고 · 엑셀 이관 정보: {excelNote}</p>
          )}
          {editing && <ContractForm form={form} set={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} />}
          <DialogFooter>
            {message && <p className="mr-auto self-center text-sm text-destructive">{message}</p>}
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              취소
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contract && (
        <RenewalDialog contract={contract} badge={badge} open={renewing} onOpenChange={setRenewing} today={today} />
      )}

      <ConflictDialog
        conflict={conflict}
        rows={
          conflict && editing
            ? (Object.keys(LABELS) as (keyof ContractInput)[])
                .filter((k) => String(conflict.latest[k]) !== String(editing.base[k]))
                .map((k) => ({ label: LABELS[k]!, latest: show(k, conflict.latest[k]), mine: show(k, form[k]) }))
            : []
        }
        onCancel={() => {
          setConflict(null);
          setEditing(null);
        }}
        onReedit={() => {
          if (!conflict) return;
          setEditing({ version: conflict.version, base: conflict.latest });
          setForm(conflict.latest);
          setErrors({});
          setMessage(undefined);
          setConflict(null);
        }}
      />
    </section>
  );
}
