"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import type { FacilityType, PaymentMethod } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";
import { formatDate } from "@/lib/date";
import { FACILITY_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { buildListHref, EMPTY_FILTERS, type ListParams } from "./list-params";

type Options = { regions: string[]; users: { id: string; name: string; isActive: boolean }[] };
type Filters = typeof EMPTY_FILTERS;

function pickFilters(p: ListParams): Filters {
  const { region, type, owner, pay, regFrom, regTo, endFrom, endTo } = p;
  return { region, type, owner, pay, regFrom, regTo, endFrom, endTo };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function CheckGroup<T extends string>({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{label}</legend>
      {items.length === 0 && <p className="text-xs text-muted-foreground">선택지 없음</p>}
      <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
        {items.map((item) => (
          <label key={item.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.includes(item.value)}
              onChange={() => onChange(toggle(selected, item.value))}
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DateRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <DatePicker value={from} onChange={(v) => onChange(v, to)} placeholder="시작일" />
      <DatePicker value={to} onChange={(v) => onChange(from, v)} placeholder="종료일" />
    </fieldset>
  );
}

export function ListControls({ params, options }: { params: ListParams; options: Options }) {
  const router = useRouter();
  const [q, setQ] = useState(params.q ?? "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(pickFilters(params));

  const go = (patch: Partial<ListParams>) => router.push(buildListHref(params, { ...patch, page: 1 }));

  const userName = (id: string) => options.users.find((u) => u.id === id)?.name ?? "알 수 없음";
  const range = (from?: string, to?: string) =>
    `${from ? formatDate(from) : ""} ~ ${to ? formatDate(to) : ""}`;

  // 적용된 필터 칩
  const chips: { key: string; label: string; remove: Partial<ListParams> }[] = [
    ...params.region.map((v) => ({
      key: `region-${v}`,
      label: `지역: ${v}`,
      remove: { region: params.region.filter((x) => x !== v) },
    })),
    ...params.type.map((v) => ({
      key: `type-${v}`,
      label: `시설 유형: ${FACILITY_TYPE_LABEL[v]}`,
      remove: { type: params.type.filter((x) => x !== v) },
    })),
    ...params.owner.map((v) => ({
      key: `owner-${v}`,
      label: `내부 담당자: ${userName(v)}`,
      remove: { owner: params.owner.filter((x) => x !== v) },
    })),
    ...params.pay.map((v) => ({
      key: `pay-${v}`,
      label: `결제 수단: ${PAYMENT_METHOD_LABEL[v]}`,
      remove: { pay: params.pay.filter((x) => x !== v) },
    })),
    ...(params.regFrom || params.regTo
      ? [{ key: "reg", label: `등록일: ${range(params.regFrom, params.regTo)}`, remove: { regFrom: undefined, regTo: undefined } }]
      : []),
    ...(params.endFrom || params.endTo
      ? [{ key: "end", label: `계약 종료일: ${range(params.endFrom, params.endTo)}`, remove: { endFrom: undefined, endTo: undefined } }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="시설명·코드·담당자·연락처·사업자번호 검색 (Enter)"
            className="h-9 pl-8"
          />
        </form>
        <Button
          variant="outline"
          className="h-9"
          onClick={() => {
            setDraft(pickFilters(params));
            setOpen(!open);
          }}
        >
          상세필터
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-6">
            <CheckGroup
              label="지역"
              items={options.regions.map((r) => ({ value: r, label: r }))}
              selected={draft.region}
              onChange={(region) => setDraft({ ...draft, region })}
            />
            <CheckGroup
              label="시설 유형"
              items={(Object.keys(FACILITY_TYPE_LABEL) as FacilityType[]).map((t) => ({
                value: t,
                label: FACILITY_TYPE_LABEL[t],
              }))}
              selected={draft.type}
              onChange={(type) => setDraft({ ...draft, type })}
            />
            <CheckGroup
              label="내부 담당자"
              items={options.users.map((u) => ({
                value: u.id,
                label: u.isActive ? u.name : `(비활성) ${u.name}`,
              }))}
              selected={draft.owner}
              onChange={(owner) => setDraft({ ...draft, owner })}
            />
            <CheckGroup
              label="결제 수단"
              items={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABEL[m],
              }))}
              selected={draft.pay}
              onChange={(pay) => setDraft({ ...draft, pay })}
            />
            <DateRange
              label="등록일"
              from={draft.regFrom}
              to={draft.regTo}
              onChange={(regFrom, regTo) => setDraft({ ...draft, regFrom, regTo })}
            />
            <DateRange
              label="계약 종료일"
              from={draft.endFrom}
              to={draft.endTo}
              onChange={(endFrom, endTo) => setDraft({ ...draft, endFrom, endTo })}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(EMPTY_FILTERS)}>
              선택 해제
            </Button>
            <Button
              onClick={() => {
                go(draft);
                setOpen(false);
              }}
            >
              적용
            </Button>
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-2.5 text-xs"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`${chip.label} 해제`}
                onClick={() => go(chip.remove)}
                className="rounded-full p-0.5 hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => go({ ...EMPTY_FILTERS, q: undefined })}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            초기화
          </button>
        </div>
      )}
    </div>
  );
}
