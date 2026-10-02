"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";
import { Field, selectClass } from "@/components/form";
import {
  CHARGE_NAME_PRESETS,
  emptyCharge,
  emptyExtraDevice,
  emptyOption,
  validateCharge,
  validateExtraDevice,
  validateOption,
  type ChargeInput,
  type ExtraDeviceInput,
  type OptionInput,
} from "@/lib/contract-input";
import { dDayLabel, formatDate } from "@/lib/date";
import {
  CHARGE_TYPE_LABEL,
  DEVICE_KIND_LABEL,
  EXTRA_REASON_LABEL,
  OPTION_CATEGORY_LABEL,
} from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import {
  addCharge,
  addExtraDevice,
  addOption,
  deleteCharge,
  deleteExtraDevice,
  deleteOption,
  updateCharge,
  updateExtraDevice,
  updateOption,
} from "./actions";
import { ContractCard, ContractSummary } from "./contract-card";
import type { ContractTabData, ContractView } from "./contract-shared";
import { CostTable, PriceFields, useCostEditor, type CostRow } from "./cost-parts";

const md = (d: string) => d.slice(5).replace("-", "."); // 'YYYY-MM-DD' → 'MM.DD'
const ymText = (ym: string) => ym.replace("-", ".");

// 표시용 변환 ─────────
const chargeRow = (id: string, c: ChargeInput): CostRow => ({
  id,
  item: c.name,
  detail: "",
  qty: "",
  date: c.type === "MONTHLY" ? "매월 (계약 기간)" : c.billingMonth ? `청구 ${ymText(c.billingMonth)}` : "",
  type: CHARGE_TYPE_LABEL[c.type],
  amount: Number(c.amount.replace(/,/g, "")) || 0,
  isFree: c.isFree,
  memo: c.isFree ? c.freeReason : "",
});

const optionRow = (id: string, o: OptionInput): CostRow => ({
  id,
  item: o.category === "OTHER" ? o.categoryOther || "기타" : o.category ? OPTION_CATEGORY_LABEL[o.category] : "-",
  detail: o.productName,
  qty: o.qty,
  date: [`제공 ${md(o.providedOn)}`, o.billingMonth && `청구 ${ymText(o.billingMonth)}`].filter(Boolean).join(" · "),
  type: CHARGE_TYPE_LABEL[o.chargeType],
  amount: Number(o.amount.replace(/,/g, "")) || 0,
  isFree: o.isFree,
  memo: [o.memo, o.isFree && o.freeReason && `무상: ${o.freeReason}`].filter(Boolean).join(" · "),
});

const extraRow = (id: string, x: ExtraDeviceInput): CostRow => ({
  id,
  item: x.kind === "OTHER" ? x.kindOther || "기타" : x.kind ? DEVICE_KIND_LABEL[x.kind] : "-",
  detail: x.reason === "OTHER" ? x.reasonOther || "기타" : x.reason ? EXTRA_REASON_LABEL[x.reason] : "",
  qty: x.qty,
  date: [`제공 ${md(x.providedOn)}`, x.billingMonth && `청구 ${ymText(x.billingMonth)}`].filter(Boolean).join(" · "),
  type: "일시",
  amount: Number(x.amount.replace(/,/g, "")) || 0,
  isFree: x.isFree,
  memo: [x.memo, x.isFree && x.freeReason && `무상: ${x.freeReason}`].filter(Boolean).join(" · "),
});

// 충돌 모달 표시 공통
const showValue = (labels: Record<string, string>) => (k: string | number | symbol, v: unknown) => {
  if (typeof v === "boolean") return v ? "Y" : "N";
  const s = String(v ?? "");
  if (!s) return "-";
  return labels[s] ?? s;
};
const ALL_LABELS: Record<string, string> = {
  ...CHARGE_TYPE_LABEL,
  ...OPTION_CATEGORY_LABEL,
  ...DEVICE_KIND_LABEL,
  ...EXTRA_REASON_LABEL,
};

function TrialCard({ trial, today }: { trial: NonNullable<ContractTabData["trial"]>; today: string }) {
  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/40">
      <div className="border-b border-violet-200 px-5 py-3">
        <h3 className="font-semibold">체험 정보</h3>
      </div>
      <dl className="grid grid-cols-1 gap-2 px-5 py-4 text-sm md:grid-cols-2">
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-muted-foreground">체험 기간</dt>
          <dd className="tabular-nums">
            {formatDate(trial.startDate)} ~ {formatDate(trial.endDate)}{" "}
            <span className="text-xs text-muted-foreground">({dDayLabel(trial.endDate, today)})</span>
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-muted-foreground">체험 장비</dt>
          <dd className="tabular-nums">
            허브 {trial.qtyHub} · 밴드 {trial.qtyBand} · 충전기 {trial.qtyCharger} · 어댑터 {trial.qtyAdapter}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function PastContracts({ past, today }: { past: ContractView[]; today: string }) {
  const [open, setOpen] = useState(false);
  if (!past.length) return null;
  return (
    <section className="rounded-lg border bg-background">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-5 py-3 text-left font-semibold">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        이전 계약 <span className="text-sm font-normal text-muted-foreground">{past.length}건</span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t px-5 py-4">
          {past.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-md border p-4">
              <p className="text-xs text-muted-foreground">{c.state === "VOID" ? "취소된 계약" : "이전 계약"}</p>
              <ContractSummary contract={c} today={today} />
              <CostTable title="비용 항목" rows={c.charges.map((x) => chargeRow(x.id, x.input))} readOnly />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// 계약·비용 탭 (화면정의서 4-2)
export function ContractTab({
  customerId,
  status,
  data,
  today,
}: {
  customerId: string;
  status: string;
  data: ContractTabData;
  today: string;
}) {
  const contract = data.current;

  const charges = useCostEditor<ChargeInput>({
    key: "charge",
    name: "비용 항목",
    empty: () => ({ ...emptyCharge(), billingMonth: today.slice(0, 7) }),
    validate: validateCharge,
    add: (v) => addCharge(contract!.id, v),
    update: updateCharge,
    remove: deleteCharge,
    rows: contract?.charges ?? [],
    labels: { type: "유형", name: "항목명", amount: "금액", isFree: "무상", freeReason: "무상 사유", billingMonth: "청구월" },
    show: showValue(ALL_LABELS),
    describe: (v) => v.name,
  });

  const options = useCostEditor<OptionInput>({
    key: "option",
    name: "옵션상품",
    empty: () => ({ ...emptyOption(), providedOn: today, billingMonth: today.slice(0, 7) }),
    validate: validateOption,
    add: (v) => addOption(customerId, v),
    update: updateOption,
    remove: deleteOption,
    rows: data.options,
    labels: {
      category: "구분",
      productName: "제품명",
      qty: "수량",
      providedOn: "제공일",
      chargeType: "유형",
      amount: "금액",
      isFree: "무상",
      billingMonth: "청구월",
      memo: "메모",
    },
    show: showValue(ALL_LABELS),
    describe: (v) => v.productName,
  });

  const extras = useCostEditor<ExtraDeviceInput>({
    key: "extra",
    name: "추가 기기",
    empty: () => ({ ...emptyExtraDevice(), providedOn: today, billingMonth: today.slice(0, 7) }),
    validate: validateExtraDevice,
    add: (v) => addExtraDevice(customerId, v),
    update: updateExtraDevice,
    remove: deleteExtraDevice,
    rows: data.extras,
    labels: {
      kind: "기기",
      qty: "수량",
      reason: "사유",
      providedOn: "제공일",
      amount: "금액",
      isFree: "무상",
      billingMonth: "청구월",
      memo: "메모",
    },
    show: showValue(ALL_LABELS),
    describe: (v) => `${v.kind ? DEVICE_KIND_LABEL[v.kind] : ""} ${v.qty}개`,
  });

  const cf = charges.form;
  const of = options.form;
  const xf = extras.form;

  return (
    <div className="flex flex-col gap-4">
      {status === "TRIAL" && data.trial && <TrialCard trial={data.trial} today={today} />}
      <ContractCard customerId={customerId} contract={contract} excelNote={data.excelNote} today={today} />

      {/* 비용 항목 */}
      <CostTable
        title="비용 항목"
        rows={(contract?.charges ?? []).map((x) => chargeRow(x.id, x.input))}
        onAdd={() => charges.open()}
        onEdit={(id) => charges.open(id)}
        onDelete={(id) => charges.setDeleting(id)}
        addDisabledReason={contract ? undefined : "계약을 먼저 등록하세요"}
        footer={
          <span className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground">월 비용 합계 (월 비용 항목 + 월 옵션상품)</span>
            {data.monthlyTotal !== null ? (
              <span className="font-semibold tabular-nums">
                {formatWon(data.monthlyTotal)}원{" "}
                <span className="text-xs font-normal text-muted-foreground">VAT {formatWon(withVat(data.monthlyTotal))}원</span>
              </span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </span>
        }
      />
      {charges.dialog(
        "비용 항목",
        <>
          <Field label="비용 유형" required error={charges.errors.type}>
            <select
              className={selectClass}
              value={cf.type}
              onChange={(e) => charges.setForm({ ...cf, type: e.target.value as ChargeInput["type"] })}
            >
              <option value="MONTHLY">월 (계약 기간 동안 매월)</option>
              <option value="ONE_TIME">일시 (청구월 1회)</option>
            </select>
          </Field>
          <Field label="항목명" required error={charges.errors.name}>
            <Input list="charge-presets" value={cf.name} onChange={(e) => charges.setForm({ ...cf, name: e.target.value })} placeholder="선택 또는 직접 입력" aria-invalid={!!charges.errors.name} />
            <datalist id="charge-presets">
              {CHARGE_NAME_PRESETS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <PriceFields form={cf} setForm={charges.setForm} errors={charges.errors} showMonth={cf.type === "ONE_TIME"} />
        </>,
      )}

      {/* 옵션상품 */}
      <CostTable
        title="옵션상품"
        rows={data.options.map((x) => optionRow(x.id, x.input))}
        onAdd={() => options.open()}
        onEdit={(id) => options.open(id)}
        onDelete={(id) => options.setDeleting(id)}
      />
      {options.dialog(
        "옵션상품",
        <>
          <Field label="상품 구분" required error={options.errors.category ?? options.errors.categoryOther}>
            <div className="flex gap-2">
              <select
                className={selectClass}
                value={of.category}
                onChange={(e) => options.setForm({ ...of, category: e.target.value as OptionInput["category"] })}
                aria-invalid={!!options.errors.category}
              >
                <option value="">선택</option>
                {Object.entries(OPTION_CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l === "기타" ? "기타(직접입력)" : l}
                  </option>
                ))}
              </select>
              {of.category === "OTHER" && (
                <Input value={of.categoryOther} onChange={(e) => options.setForm({ ...of, categoryOther: e.target.value })} placeholder="직접입력" />
              )}
            </div>
          </Field>
          <Field label="제품명·모델" required error={options.errors.productName}>
            <Input value={of.productName} onChange={(e) => options.setForm({ ...of, productName: e.target.value })} aria-invalid={!!options.errors.productName} />
          </Field>
          <Field label="수량" required error={options.errors.qty}>
            <Input inputMode="numeric" value={of.qty} onChange={(e) => options.setForm({ ...of, qty: e.target.value })} />
          </Field>
          <Field label="제공일" required error={options.errors.providedOn}>
            <DatePicker value={of.providedOn || undefined} onChange={(v) => options.setForm({ ...of, providedOn: v ?? "" })} />
          </Field>
          <Field label="비용 유형" required>
            <select
              className={selectClass}
              value={of.chargeType}
              onChange={(e) => options.setForm({ ...of, chargeType: e.target.value as OptionInput["chargeType"] })}
            >
              <option value="ONE_TIME">일시 (청구월 1회)</option>
              <option value="MONTHLY">월 (매월)</option>
            </select>
          </Field>
          <div />
          <PriceFields form={of} setForm={options.setForm} errors={options.errors} showMonth={of.chargeType === "ONE_TIME"} />
          <Field label="메모" className="sm:col-span-2">
            <Input value={of.memo} onChange={(e) => options.setForm({ ...of, memo: e.target.value })} />
          </Field>
        </>,
      )}

      {/* 추가 기기 제공 */}
      <CostTable
        title="추가 기기 제공"
        rows={data.extras.map((x) => extraRow(x.id, x.input))}
        onAdd={() => extras.open()}
        onEdit={(id) => extras.open(id)}
        onDelete={(id) => extras.setDeleting(id)}
      />
      {extras.dialog(
        "추가 기기",
        <>
          <Field label="기기 종류" required error={extras.errors.kind ?? extras.errors.kindOther}>
            <div className="flex gap-2">
              <select
                className={selectClass}
                value={xf.kind}
                onChange={(e) => extras.setForm({ ...xf, kind: e.target.value as ExtraDeviceInput["kind"] })}
                aria-invalid={!!extras.errors.kind}
              >
                <option value="">선택</option>
                {Object.entries(DEVICE_KIND_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l === "기타" ? "기타(직접입력)" : l}
                  </option>
                ))}
              </select>
              {xf.kind === "OTHER" && (
                <Input value={xf.kindOther} onChange={(e) => extras.setForm({ ...xf, kindOther: e.target.value })} placeholder="기기명" />
              )}
            </div>
          </Field>
          <Field label="수량" required error={extras.errors.qty}>
            <Input inputMode="numeric" value={xf.qty} onChange={(e) => extras.setForm({ ...xf, qty: e.target.value })} />
          </Field>
          <Field label="제공 사유" required error={extras.errors.reason ?? extras.errors.reasonOther}>
            <div className="flex gap-2">
              <select
                className={selectClass}
                value={xf.reason}
                onChange={(e) => extras.setForm({ ...xf, reason: e.target.value as ExtraDeviceInput["reason"] })}
                aria-invalid={!!extras.errors.reason}
              >
                <option value="">선택</option>
                {Object.entries(EXTRA_REASON_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l === "기타" ? "기타(직접입력)" : l}
                  </option>
                ))}
              </select>
              {xf.reason === "OTHER" && (
                <Input value={xf.reasonOther} onChange={(e) => extras.setForm({ ...xf, reasonOther: e.target.value })} placeholder="사유" />
              )}
            </div>
          </Field>
          <Field label="제공일" required error={extras.errors.providedOn}>
            <DatePicker value={xf.providedOn || undefined} onChange={(v) => extras.setForm({ ...xf, providedOn: v ?? "" })} />
          </Field>
          <PriceFields form={xf} setForm={extras.setForm} errors={extras.errors} showMonth />
          <Field label="메모" className="sm:col-span-2">
            <Input value={xf.memo} onChange={(e) => extras.setForm({ ...xf, memo: e.target.value })} />
          </Field>
        </>,
      )}

      <PastContracts past={data.past} today={today} />
    </div>
  );
}
