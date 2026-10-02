// 고객사 리스트의 탭·검색·필터·정렬·페이지 ↔ URL 쿼리 (화면정의서 1-2: URL에 반영)
import type { AlertType, CustomerStatus, FacilityType, PaymentMethod } from "@/generated/prisma/enums";
import { ALERT_TYPES } from "@/lib/alert-info";
import { isDateString } from "@/lib/date";
import { CUSTOMER_STATUSES, FACILITY_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";

export const SORT_KEYS = ["no", "name", "status", "owner", "endDate", "monthly", "createdAt"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type ListParams = {
  tab?: CustomerStatus;
  q?: string;
  region: string[];
  type: FacilityType[];
  owner: string[];
  pay: PaymentMethod[];
  alert: AlertType[]; // 알림 종류 필터
  regFrom?: string;
  regTo?: string;
  endFrom?: string;
  endTo?: string;
  sort: SortKey;
  dir: SortDir;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined) => list(v)[0];
const date = (v: string | string[] | undefined) => {
  const s = one(v);
  return s && isDateString(s) ? s : undefined;
};
const oneOf = <T extends string>(values: readonly T[], v: string | undefined) =>
  values.includes(v as T) ? (v as T) : undefined;

export function parseListParams(raw: RawParams): ListParams {
  const facilityTypes = Object.keys(FACILITY_TYPE_LABEL) as FacilityType[];
  const payments = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];
  const sort = oneOf(SORT_KEYS, one(raw.sort)) ?? "createdAt";
  const page = Number(one(raw.page));

  return {
    tab: oneOf(CUSTOMER_STATUSES, one(raw.tab)),
    q: one(raw.q)?.trim() || undefined,
    region: list(raw.region).filter(Boolean),
    type: list(raw.type).filter((t): t is FacilityType => facilityTypes.includes(t as FacilityType)),
    owner: list(raw.owner).filter(Boolean),
    pay: list(raw.pay).filter((p): p is PaymentMethod => payments.includes(p as PaymentMethod)),
    alert: list(raw.alert).filter((a): a is AlertType => ALERT_TYPES.includes(a as AlertType)),
    regFrom: date(raw.regFrom),
    regTo: date(raw.regTo),
    endFrom: date(raw.endFrom),
    endTo: date(raw.endTo),
    sort,
    dir: one(raw.dir) === "asc" ? "asc" : one(raw.dir) === "desc" ? "desc" : sort === "createdAt" ? "desc" : "asc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

// 현재 값에 변경분을 덮어써 /customers?… 주소 생성 (기본값은 주소에서 생략)
export function buildListHref(base: ListParams, patch: Partial<ListParams> = {}): string {
  const p = { ...base, ...patch };
  const sp = new URLSearchParams();
  if (p.tab) sp.set("tab", p.tab);
  if (p.q) sp.set("q", p.q);
  p.region.forEach((v) => sp.append("region", v));
  p.type.forEach((v) => sp.append("type", v));
  p.owner.forEach((v) => sp.append("owner", v));
  p.pay.forEach((v) => sp.append("pay", v));
  p.alert.forEach((v) => sp.append("alert", v));
  if (p.regFrom) sp.set("regFrom", p.regFrom);
  if (p.regTo) sp.set("regTo", p.regTo);
  if (p.endFrom) sp.set("endFrom", p.endFrom);
  if (p.endTo) sp.set("endTo", p.endTo);
  if (!(p.sort === "createdAt" && p.dir === "desc")) {
    sp.set("sort", p.sort);
    sp.set("dir", p.dir);
  }
  if (p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export const EMPTY_FILTERS: Pick<
  ListParams,
  "region" | "type" | "owner" | "pay" | "alert" | "regFrom" | "regTo" | "endFrom" | "endTo"
> = { region: [], type: [], owner: [], pay: [], alert: [], regFrom: undefined, regTo: undefined, endFrom: undefined, endTo: undefined };
