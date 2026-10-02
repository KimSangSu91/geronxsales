// 엑셀(고객관리.xlsx) → 시스템 이관 (docs/이관매핑표.md)
// 실행:  npm run migrate:excel            → 미리보기(dry-run), DB 변경 없음
//        npm run migrate:excel -- --apply → 실제 이관 (한 트랜잭션, 실패 시 전부 취소)
// 원칙: 원본 엑셀은 수정하지 않음 / 이미 있는 고객사는 "비어 있는 칸만" 채움(덮어쓰지 않음) / 여러 번 실행해도 중복 없음
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type CustomerStatus } from "../src/generated/prisma/client";
import { CODE_RE, normalizePhone } from "../src/lib/customer-input";
import { formatDate, fromDbDate, todayKst, toDbDate } from "../src/lib/date";
import { recordHistory } from "../src/lib/history";
import { CUSTOMER_STATUS_LABEL } from "../src/lib/labels";

const FILE = "고객관리.xlsx";
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

// 엑셀 단계 → 상태 (문의 접수는 고객사가 아닌 인바운드 문의함 → 4단계에서 이관)
const STAGE: Record<string, CustomerStatus | "INQUIRY"> = {
  완료: "ACTIVE",
  "진행 중": "ONBOARDING",
  중지: "NOT_CONVERTED",
  "문의 접수": "INQUIRY",
};

// 엑셀 체크리스트 컬럼 → ChecklistItem.code
const CHECK_COLUMNS: [string, string][] = [
  ["입소자 정보", "resident_info"],
  ["시설 정보", "facility_info"],
  ["조감도", "site_plan"],
  ["개인정보", "privacy_consent"],
  ["계약서날인", "contract_signed"],
  ["장비 매핑", "device_mapping"],
  ["계정 생성", "account_created"],
  ["밴드 라벨링", "band_labeling"],
  ["설치", "installation"],
  ["QA", "qa"],
  ["테블릿&TV", "tablet_tv"],
];

type Row = {
  line: number;
  stage: string;
  name: string;
  contact: string;
  phone: string;
  history: string;
  region: string;
  meeting: string | null;
  contractDate: string | null;
  installDate: string | null;
  code: string;
  capacity: number | null;
  contractUsers: number | null;
  qtyHub: number | null;
  qtyBand: number | null;
  qtyCharger: number | null;
  checks: Record<string, boolean>;
  memo: string;
};

// ───────── 엑셀 읽기 ─────────

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return fromDbDate(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return v.result == null ? "" : String(v.result);
    return "";
  }
  return String(v).trim();
}

const dateOf = (v: ExcelJS.CellValue) => (v instanceof Date ? fromDbDate(v) : null);
const intOf = (v: ExcelJS.CellValue) => {
  const s = cellText(v).replace(/,/g, "");
  return /^\d+$/.test(s) ? Number(s) : null;
};

async function readRows(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets[0];

  // '시설명'이 있는 행을 헤더로
  let headerRow = 0;
  const col: Record<string, number> = {};
  ws.eachRow((row, i) => {
    if (headerRow) return;
    const texts = (row.values as ExcelJS.CellValue[]).map((v) => cellText(v).replace(/\s+/g, " "));
    if (texts.includes("시설명")) {
      headerRow = i;
      texts.forEach((t, j) => t && (col[t] = j));
    }
  });
  if (!headerRow) throw new Error("헤더 행('시설명')을 찾지 못했습니다.");
  // 정확히 같은 이름 우선, 없으면 앞부분 일치 ("설치"가 "설치일(예정일)"에 잘못 걸리지 않도록)
  const find = (prefix: string) => {
    const key = col[prefix] ? prefix : Object.keys(col).find((k) => k.startsWith(prefix));
    if (!key) throw new Error(`컬럼 '${prefix}'를 찾지 못했습니다.`);
    return col[key];
  };

  const rows: Row[] = [];
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const get = (prefix: string) => row.getCell(find(prefix)).value;
    const name = cellText(get("시설명"));
    if (!name) return;
    rows.push({
      line: i,
      stage: cellText(get("단계")),
      name,
      contact: cellText(get("담당자")),
      phone: cellText(get("번호")),
      history: cellText(get("히스토리")),
      region: cellText(get("지역")),
      meeting: dateOf(get("미팅")),
      contractDate: dateOf(get("계약일")),
      installDate: dateOf(get("설치일")),
      code: cellText(get("도메인키")).toLowerCase(),
      capacity: intOf(get("정원")),
      contractUsers: intOf(get("계약user")),
      qtyHub: intOf(get("허브")),
      qtyBand: intOf(get("밴드")),
      qtyCharger: intOf(get("충전기")),
      checks: Object.fromEntries(
        CHECK_COLUMNS.map(([label, code]) => [code, cellText(get(label)).toLowerCase() === "true"]),
      ),
      memo: cellText(get("비고")),
    });
  });
  return rows;
}

// ───────── 계획 세우기 ─────────

type Plan = {
  row: Row;
  customerId: string | null; // null = 새로 생성 대상
  customerLabel: string;
  fill: Record<string, { label: string; value: string | number | Date }>; // 빈 칸 채우기
  checkItems: string[]; // 완료로 바꿀 체크리스트 entry id
  checkLabels: string[];
  meeting: string | null; // 미팅 히스토리 추가
  history: string | null; // 히스토리 원문 추가
  contractNote: string | null; // 계약 탭 입력 필요 정보
  warnings: string[];
  skip: string | null; // 이관 제외 사유
};

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && (!v.trim() || v === "미입력"));

async function plan(rows: Row[]): Promise<Plan[]> {
  const items = await prisma.checklistItem.findMany({ where: { kind: "ONBOARDING" } });
  const itemLabel = Object.fromEntries(items.map((i) => [i.code, i.label]));
  const codesInFile = new Map<string, number>();
  rows.forEach((r) => r.code && codesInFile.set(r.code, (codesInFile.get(r.code) ?? 0) + 1));

  const plans: Plan[] = [];
  for (const row of rows) {
    const warnings: string[] = [];
    const stage = STAGE[row.stage];
    const p: Plan = {
      row,
      customerId: null,
      customerLabel: row.name,
      fill: {},
      checkItems: [],
      checkLabels: [],
      meeting: null,
      history: null,
      contractNote: null,
      warnings,
      skip: null,
    };
    plans.push(p);

    if (!stage) {
      p.skip = `알 수 없는 단계 '${row.stage}'`;
      continue;
    }
    if (stage === "INQUIRY") {
      p.skip = "문의 접수 → 인바운드 문의함(4단계)에서 이관";
      continue;
    }

    // 기존 고객사 찾기: 시설명(원문·괄호 앞) 또는 코드
    const baseName = row.name.replace(/\s*\(.*\)\s*$/, "");
    const existing = await prisma.customer.findFirst({
      where: { OR: [{ name: row.name }, { name: baseName }, ...(row.code ? [{ code: row.code }] : [])] },
      include: {
        contacts: true,
        checklist: { where: { closureId: null }, include: { item: true } },
        histories: { select: { kind: true, activityType: true, occurredOn: true, content: true } },
      },
    });
    if (!existing) {
      // 이번 파일은 모두 기존 고객사 — 신규 생성은 필요할 때 추가 (이관매핑표 1장 규칙)
      p.skip = "시스템에 없는 고객사 — 신규 생성은 이번 스크립트 범위 밖 (알려 주세요)";
      continue;
    }
    p.customerId = existing.id;
    p.customerLabel = `${existing.no}번 ${existing.name}`;

    if (existing.status !== stage) {
      warnings.push(`상태 다름: 시스템 ${CUSTOMER_STATUS_LABEL[existing.status]} / 엑셀 ${row.stage} → 시스템 값 유지`);
    }

    // 빈 칸만 채우기
    if (blank(existing.region) && row.region) p.fill.region = { label: "지역", value: row.region };
    if (row.code) {
      if (!CODE_RE.test(row.code)) warnings.push(`도메인키 '${row.code}' 형식 오류(영문 소문자·숫자) → 건너뜀`);
      else if ((codesInFile.get(row.code) ?? 0) > 1) warnings.push(`도메인키 '${row.code}' 엑셀 안에서 중복 → 건너뜀`);
      else if (blank(existing.code)) {
        const taken = await prisma.customer.findFirst({ where: { code: row.code, id: { not: existing.id } } });
        if (taken) warnings.push(`도메인키 '${row.code}'를 다른 고객사(${taken.name})가 사용 중 → 건너뜀`);
        else p.fill.code = { label: "고객사 코드", value: row.code };
      } else if (existing.code !== row.code) {
        warnings.push(`코드 다름: 시스템 ${existing.code} / 엑셀 ${row.code} → 시스템 값 유지`);
      }
    }
    if (blank(existing.capacity) && row.capacity !== null) p.fill.capacity = { label: "정원", value: row.capacity };
    if (blank(existing.installDate) && row.installDate)
      p.fill.installDate = { label: "설치 예정일", value: row.installDate };
    if (blank(existing.memo) && row.memo) p.fill.memo = { label: "메모", value: row.memo };

    // 시설 담당자: 없을 때만 추가
    if (existing.contacts.length === 0 && row.contact) {
      warnings.push("시설 담당자 없음 + 엑셀 담당자 있음 → 이번 이관에서는 추가하지 않음(확인 필요)");
    }
    if (existing.contacts.length === 0 && !row.contact) {
      warnings.push("시설 담당자 없음 (엑셀에도 없음) → 상세에서 직접 추가 필요");
    }
    if (row.phone && normalizePhone(row.phone) !== row.phone) warnings.push(`연락처 형식: ${row.phone}`);

    // 체크리스트: 엑셀 TRUE + 시스템 미완료 → 완료(완료자 '이관', 완료일 비움)
    for (const [, code] of CHECK_COLUMNS) {
      if (!row.checks[code]) continue;
      const entry = existing.checklist.find((e) => e.item.code === code);
      if (!entry) warnings.push(`체크리스트 '${itemLabel[code]}' 항목 없음`);
      else if (!entry.done) {
        p.checkItems.push(entry.id);
        p.checkLabels.push(itemLabel[code]);
      }
    }

    // 미팅 → '미팅' 유형 수동 히스토리 (같은 날짜 미팅 기록이 이미 있으면 건너뜀)
    if (row.meeting) {
      const dup = existing.histories.some(
        (h) => h.kind === "MANUAL" && h.activityType === "MEETING" && fromDbDate(h.occurredOn) === row.meeting,
      );
      if (!dup) p.meeting = row.meeting;
    }
    // 히스토리 원문 → 수동 히스토리 (같은 내용이 이미 있으면 건너뜀)
    if (row.history) {
      const norm = (s: string) => s.replace(/\s+/g, "");
      if (!existing.histories.some((h) => norm(h.content) === norm(row.history))) p.history = row.history;
    }

    // 계약 정보: 계약 종료일이 엑셀에 없어 계약은 만들지 않음 → 2단계 계약 탭에서 입력하도록 기록
    const contractBits = [
      row.contractDate && `계약일 ${formatDate(row.contractDate)}`,
      row.contractUsers !== null && `계약 인원 ${row.contractUsers}명`,
      row.qtyHub !== null && `허브 ${row.qtyHub}`,
      row.qtyBand !== null && `밴드 ${row.qtyBand}`,
      row.qtyCharger !== null && `충전기 ${row.qtyCharger}`,
    ].filter(Boolean);
    const alreadyNoted = existing.histories.some((h) => h.content.startsWith("엑셀 계약 정보"));
    if (contractBits.length && !alreadyNoted) p.contractNote = contractBits.join(" · ");
  }
  return plans;
}

// ───────── 출력 ─────────

function report(plans: Plan[]) {
  const show = (v: string | number | Date) => (v instanceof Date ? fromDbDate(v) : String(v));
  console.log(`\n=== 엑셀 이관 ${APPLY ? "실행" : "미리보기 (DB 변경 없음)"} — ${FILE}, ${plans.length}행 ===\n`);
  for (const p of plans) {
    console.log(`■ [엑셀 ${p.row.line}행] ${p.customerLabel}`);
    if (p.skip) {
      console.log(`   - 제외: ${p.skip}\n`);
      continue;
    }
    const fills = Object.values(p.fill).map((f) => `${f.label}=${show(f.value)}`);
    console.log(`   - 빈 칸 채우기: ${fills.length ? fills.join(", ") : "없음"}`);
    console.log(`   - 체크리스트 완료(이관): ${p.checkLabels.length ? `${p.checkLabels.length}개 (${p.checkLabels.join(", ")})` : "없음"}`);
    if (p.meeting) console.log(`   - 히스토리 추가: [미팅] ${formatDate(p.meeting)}`);
    if (p.history) console.log(`   - 히스토리 추가: [기타] ${p.history.slice(0, 50)}`);
    if (p.contractNote) console.log(`   - 계약 정보(2단계 계약 탭에서 입력 필요): ${p.contractNote}`);
    for (const w of p.warnings) console.log(`   ⚠ ${w}`);
    console.log("");
  }
  const targets = plans.filter((p) => !p.skip);
  console.log("=== 요약 ===");
  console.log(`대상 고객사 ${targets.length}곳 / 제외 ${plans.length - targets.length}행`);
  console.log(`빈 칸 채우기 ${targets.reduce((s, p) => s + Object.keys(p.fill).length, 0)}건`);
  console.log(`체크리스트 완료 처리 ${targets.reduce((s, p) => s + p.checkItems.length, 0)}개`);
  console.log(`미팅 히스토리 ${targets.filter((p) => p.meeting).length}건 / 히스토리 원문 ${targets.filter((p) => p.history).length}건`);
  console.log(`계약 정보 보완 필요 ${targets.filter((p) => p.contractNote).length}곳 (2단계에서 계약 입력)`);
  console.log(`경고 ${targets.reduce((s, p) => s + p.warnings.length, 0)}건`);
}

// ───────── 실행 ─────────

async function apply(plans: Plan[]) {
  const occurredOn = toDbDate(todayKst());
  await prisma.$transaction(
    async (tx) => {
      for (const p of plans) {
        if (p.skip || !p.customerId) continue;
        const customerId = p.customerId;
        const data: Record<string, unknown> = {};
        for (const [k, f] of Object.entries(p.fill)) {
          data[k] = k === "installDate" ? toDbDate(f.value as string) : f.value;
        }
        if (Object.keys(data).length) {
          await tx.customer.update({ where: { id: customerId }, data: { ...data, version: { increment: 1 } } });
        }
        if (p.checkItems.length) {
          // 완료자 없음(null) = '이관', 완료일은 비움 → 화면에서 실제 완료일 입력 가능
          await tx.checklistEntry.updateMany({
            where: { id: { in: p.checkItems }, done: false },
            data: { done: true, doneAt: null, doneById: null },
          });
        }
        if (p.meeting) {
          await tx.history.create({
            data: {
              customerId,
              kind: "MANUAL",
              event: "activity",
              activityType: "MEETING",
              occurredOn: toDbDate(p.meeting),
              content: "미팅 (엑셀 이관)",
              actorId: null,
            },
          });
        }
        if (p.history) {
          await tx.history.create({
            data: { customerId, kind: "MANUAL", event: "activity", activityType: "OTHER", occurredOn, content: p.history, actorId: null },
          });
        }
        const summary = [
          ...Object.values(p.fill).map((f) => `${f.label} ${f.value instanceof Date ? fromDbDate(f.value) : f.value}`),
          p.checkLabels.length && `체크리스트 완료 ${p.checkLabels.length}개`,
        ].filter(Boolean);
        if (summary.length || p.meeting || p.history) {
          await recordHistory(tx, {
            customerId,
            event: "migrated",
            content: `엑셀 이관(빈 칸 채우기): ${summary.length ? summary.join(", ") : "히스토리 추가"}`,
            data: { fill: Object.fromEntries(Object.entries(p.fill).map(([k, f]) => [k, String(f.value)])), checklist: p.checkLabels },
            actorId: null,
          });
        }
        if (p.contractNote) {
          await recordHistory(tx, {
            customerId,
            event: "migrated",
            content: `엑셀 계약 정보 (계약 탭에서 계약 입력 필요): ${p.contractNote}`,
            actorId: null,
          });
        }
      }
    },
    { timeout: 60_000 },
  );
}

async function main() {
  const rows = await readRows();
  const plans = await plan(rows);
  report(plans);
  if (APPLY) {
    await apply(plans);
    console.log("\n✔ 이관을 완료했습니다.");
  } else {
    console.log("\n미리보기입니다. 실제 이관: npm run migrate:excel -- --apply");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
