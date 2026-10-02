// 업무 날짜는 KST 기준 'YYYY-MM-DD' 문자열로 다룸
// DB(@db.Date) ↔ 문자열 변환은 이 파일의 toDbDate / fromDbDate만 사용

const TZ = "Asia/Seoul";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 오늘(KST) → 'YYYY-MM-DD'
export function todayKst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

// 'YYYY-MM-DD' → @db.Date 저장용 Date (UTC 자정)
export function toDbDate(value: string): Date {
  if (!isDateString(value)) throw new Error(`잘못된 날짜: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

// @db.Date 값 → 'YYYY-MM-DD'
export function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' + n일
export function addDays(value: string, days: number): string {
  const d = toDbDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

// 'YYYY-MM-DD' + n개월 (말일 보정: 1/31 + 1개월 → 2/28)
export function addMonths(value: string, months: number): string {
  const d = toDbDate(value);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromDbDate(d);
}

// to - from (일 수)
export function diffDays(from: string, to: string): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000);
}

// 'YYYY-MM-DD'(KST) 하루의 시작 시각 — DateTime 컬럼(등록일 등) 기간 검색용
export function kstStartOfDay(value: string): Date {
  if (!isDateString(value)) throw new Error(`잘못된 날짜: ${value}`);
  return new Date(`${value}T00:00:00+09:00`);
}

// D-day 표시: 남으면 "D-50", 당일 "D-Day", 지나면 "D+3"
export function dDayLabel(target: string, today: string = todayKst()): string {
  const diff = diffDays(today, target);
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

// 오늘 기준 남은 기간: "90일 남음" / "오늘 종료" / "3일 지남" (화면 표기는 D-day 대신 이것으로 통일)
export function dDayText(target: string, today: string = todayKst()): string {
  const diff = diffDays(today, target);
  return diff === 0 ? "오늘 종료" : diff > 0 ? `${diff}일 남음` : `${-diff}일 지남`;
}

// 'YYYY-MM-DD' → 'YYYY.MM.DD'
export function formatDate(value: string): string {
  return value.replaceAll("-", ".");
}

// 시각(DateTime) → KST 'YYYY-MM-DD HH:mm' (로그인 기록·히스토리 표시용)
export function formatDateTimeKst(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
