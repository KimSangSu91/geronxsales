"use client";

import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";
import { Field, selectClass } from "@/components/form";
import { emptyOption, validateOption, type OptionInput } from "@/lib/contract-input";
import { CHARGE_TYPE_LABEL, OPTION_CATEGORY_LABEL } from "@/lib/labels";
import { addOption, deleteOption, updateOption } from "./actions";
import type { Row } from "./contract-shared";
import { PriceFields, useCostEditor } from "./cost-parts";

const LABELS: Record<string, string> = { ...CHARGE_TYPE_LABEL, ...OPTION_CATEGORY_LABEL };
const show = (_k: unknown, v: unknown) => (typeof v === "boolean" ? (v ? "Y" : "N") : String(v ?? "") ? (LABELS[String(v)] ?? String(v)) : "-");

// 옵션상품 추가·수정·삭제 — 계약·비용 탭과 장비 탭이 같은 입력 창 사용 (같은 데이터)
export function useOptionEditor({ customerId, rows, today }: { customerId: string; rows: Row<OptionInput>[]; today: string }) {
  const options = useCostEditor<OptionInput>({
    key: "option",
    name: "옵션상품",
    empty: () => ({ ...emptyOption(), providedOn: today, billingMonth: today.slice(0, 7) }),
    validate: validateOption,
    add: (v) => addOption(customerId, v),
    update: updateOption,
    remove: deleteOption,
    rows,
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
    show,
    describe: (v) => v.productName,
  });
  const of = options.form;

  const dialog = options.dialog(
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
  );

  return { open: options.open, setDeleting: options.setDeleting, dialog };
}
