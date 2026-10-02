import "server-only";
import type { AlertLevel, AlertType } from "@/generated/prisma/enums";
import { LEVEL_ORDER, type AlertView } from "@/lib/alert-info";
import { addDays, diffDays, dDayText, formatDate, formatDateTimeKst, fromDbDate, todayKst } from "@/lib/date";
import { formatWon } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getAlertSettings } from "@/lib/settings";

// 알림 = 조건을 매번 계산해 Alert 표와 맞춤 (기능정의서 4-10, 데이터모델 3-7)
// - 새로 해당하면 생성(dedupeKey = 유형:대상:단계 → 주황 → 빨강 단계가 바뀌면 새 알림)
// - 더 이상 해당하지 않으면 해제(resolvedAt) — 상태 변경·기한 갱신 등
// 실행: 매일 배치 + 🔔·대시보드·리스트를 열 때 (1분 안에 다시 열면 건너뜀)

// 시각 → KST 날짜
const kstDay = (d: Date) => formatDateTimeKst(d).slice(0, 10);

type Spec = {
  type: AlertType;
  level: AlertLevel;
  customerId: string | null;
  refId: string;
  message: string;
  dueDate: string | null;
};

export async function computeAlerts(today = todayKst()): Promise<Spec[]> {
  const days = await getAlertSettings();
  const specs: Spec[] = [];
  const add = (s: Spec) => specs.push(s);

  const customers = await prisma.customer.findMany({
    where: { status: { in: ["PENDING", "ONBOARDING", "TRIAL", "ACTIVE", "ENDED", "TERMINATED", "NOT_CONVERTED", "OTHER"] } },
    select: {
      id: true,
      status: true,
      statusChangedAt: true,
      installDate: true,
      owner: { select: { isActive: true, name: true } },
      contracts: {
        where: { state: "CURRENT" },
        take: 1,
        select: { id: true, endDate: true, renewalCancelled: true, autoRenewedFrom: true },
      },
      trials: { where: { result: "IN_PROGRESS" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, endDate: true } },
      closures: {
        where: { completedAt: null },
        select: { id: true, createdAt: true, entries: { select: { done: true } } },
      },
      histories: { where: { kind: "MANUAL" }, orderBy: { occurredOn: "desc" }, take: 1, select: { occurredOn: true } },
    },
  });

  for (const c of customers) {
    const contract = c.contracts[0];
    // 갱신 (사용중)
    if (c.status === "ACTIVE" && contract) {
      const end = fromDbDate(contract.endDate);
      if (contract.autoRenewedFrom) {
        add({ type: "AUTO_RENEWED_UNCONFIRMED", level: "DANGER", customerId: c.id, refId: contract.id, dueDate: end,
          message: `자동연장됨 · 종료일 ${formatDate(fromDbDate(contract.autoRenewedFrom))} → ${formatDate(end)} 확인 필요` });
      } else if (contract.renewalCancelled) {
        add({ type: "RENEWAL_CANCELLED", level: "INFO", customerId: c.id, refId: contract.id, dueDate: end,
          message: `갱신 취소 · ${formatDate(end)} 계약종료 예정 (${dDayText(end, today)})` });
      } else if (end <= addDays(today, days["alert.renewal_days"])) {
        add({ type: "RENEWAL_CHECK", level: end < today ? "DANGER" : "WARNING", customerId: c.id, refId: contract.id, dueDate: end,
          message: `계약 종료 ${formatDate(end)} (${dDayText(end, today)})` });
      }
    }
    // 진행대기 장기 체류: 마지막 활동(수동 기록 또는 상태 변경) 후 N일
    if (c.status === "PENDING") {
      const statusDay = kstDay(c.statusChangedAt);
      const lastManual = c.histories[0] ? fromDbDate(c.histories[0].occurredOn) : null;
      const last = lastManual && lastManual > statusDay ? lastManual : statusDay;
      if (diffDays(last, today) > days["alert.pending_stale_days"]) {
        add({ type: "PENDING_STALE", level: "WARNING", customerId: c.id, refId: c.id, dueDate: null,
          message: `마지막 활동 ${formatDate(last)} (${diffDays(last, today)}일 경과)` });
      }
    }
    // 체험 종료: D-N 주황, 경과 빨강
    const trial = c.trials[0];
    if (c.status === "TRIAL" && trial) {
      const end = fromDbDate(trial.endDate);
      if (end < today) {
        add({ type: "TRIAL_ENDING", level: "DANGER", customerId: c.id, refId: trial.id, dueDate: end,
          message: `체험 기간 경과 · 종료일 ${formatDate(end)} (${dDayText(end, today)})` });
      } else if (end <= addDays(today, days["alert.trial_end_days"])) {
        add({ type: "TRIAL_ENDING", level: "WARNING", customerId: c.id, refId: trial.id, dueDate: end,
          message: `체험 종료 ${formatDate(end)} (${dDayText(end, today)})` });
      }
    }
    // 도입 지연: 도입준비 + 설치 예정일 경과
    if (c.status === "ONBOARDING" && c.installDate && fromDbDate(c.installDate) < today) {
      const d = fromDbDate(c.installDate);
      add({ type: "ONBOARDING_DELAYED", level: "DANGER", customerId: c.id, refId: c.id, dueDate: d,
        message: `설치 예정일 ${formatDate(d)} 경과 (${diffDays(d, today)}일)` });
    }
    // 장비 미회수: 회수·종료 체크리스트 미완료 N일 경과
    if (["NOT_CONVERTED", "ENDED", "TERMINATED"].includes(c.status)) {
      for (const cl of c.closures) {
        const created = kstDay(cl.createdAt);
        if (diffDays(created, today) > days["alert.recovery_days"]) {
          const done = cl.entries.filter((e) => e.done).length;
          add({ type: "RECOVERY_INCOMPLETE", level: "DANGER", customerId: c.id, refId: cl.id, dueDate: null,
            message: `회수·종료 체크리스트 미완료 ${done}/${cl.entries.length} (생성 후 ${diffDays(created, today)}일)` });
        }
      }
    }
    // 담당자 재배정 필요 (종료 계열 제외)
    if (!c.owner.isActive && !["ENDED", "TERMINATED", "NOT_CONVERTED"].includes(c.status)) {
      add({ type: "OWNER_INACTIVE", level: "INFO", customerId: c.id, refId: c.id, dueDate: null,
        message: `내부 담당자 비활성 (${c.owner.name}) · 재배정 필요` });
    }
  }

  // 청구: 청구 미처리(청구일 + N일까지 세금계산서 미업로드) / 미납
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["BEFORE", "UNPAID"] }, billingMonth: { lte: new Date(`${today.slice(0, 7)}-01T00:00:00Z`) } },
    select: {
      id: true,
      customerId: true,
      billingMonth: true,
      status: true,
      plannedAmount: true,
      adjustedAmount: true,
      customer: { select: { billingDay: true } },
      _count: { select: { documents: true } },
    },
  });
  for (const inv of invoices) {
    const month = fromDbDate(inv.billingMonth).slice(0, 7);
    const amount = inv.adjustedAmount ?? inv.plannedAmount;
    if (inv.status === "UNPAID") {
      add({ type: "INVOICE_UNPAID", level: "DANGER", customerId: inv.customerId, refId: inv.id, dueDate: null,
        message: `${month.replace("-", ".")} 미납 ${formatWon(amount)}원` });
      continue;
    }
    // 청구일(없으면 1일) + N일이 지나도록 세금계산서가 없으면
    const day = String(Math.min(inv.customer.billingDay ?? 1, 28)).padStart(2, "0");
    const deadline = addDays(`${month}-${day}`, days["alert.invoice_days"]);
    if (inv._count.documents === 0 && today > deadline) {
      add({ type: "INVOICE_UNBILLED", level: "WARNING", customerId: inv.customerId, refId: inv.id, dueDate: deadline,
        message: `${month.replace("-", ".")} 세금계산서 미업로드 (기한 ${formatDate(deadline)})` });
    }
  }

  // 미처리 문의 (인바운드 문의함 — 4단계)
  const inquiries = await prisma.inquiry.findMany({ where: { status: "NEW" }, select: { id: true, receivedAt: true, facilityName: true } });
  for (const q of inquiries) {
    const received = kstDay(q.receivedAt);
    if (diffDays(received, today) > days["alert.inquiry_days"]) {
      add({ type: "INQUIRY_UNHANDLED", level: "WARNING", customerId: null, refId: q.id, dueDate: null,
        message: `미처리 문의: ${q.facilityName ?? "시설명 없음"} (접수 후 ${diffDays(received, today)}일)` });
    }
  }
  return specs;
}

const keyOf = (s: Spec) => `${s.type}:${s.refId}:${s.level}`;

export async function syncAlerts(today = todayKst()) {
  const specs = await computeAlerts(today);
  const keys = new Set(specs.map(keyOf));
  const now = new Date();
  let created = 0;

  // 더 이상 해당하지 않는 알림 해제
  const { count: resolved } = await prisma.alert.updateMany({
    where: { resolvedAt: null, dedupeKey: { notIn: [...keys] } },
    data: { resolvedAt: now },
  });

  const existing = await prisma.alert.findMany({ where: { dedupeKey: { in: [...keys] } } });
  for (const s of specs) {
    const key = keyOf(s);
    const data = {
      type: s.type,
      level: s.level,
      customerId: s.customerId,
      refId: s.refId,
      message: s.message,
      dueDate: s.dueDate ? new Date(`${s.dueDate}T00:00:00Z`) : null,
    };
    const old = existing.find((a) => a.dedupeKey === key);
    if (!old) {
      await prisma.alert.create({ data: { ...data, dedupeKey: key } });
      created++;
    } else if (old.resolvedAt) {
      // 해제됐던 알림이 다시 해당 → 새 알림으로 다시 띄움
      await prisma.alert.update({ where: { id: old.id }, data: { ...data, resolvedAt: null, createdAt: now } });
      created++;
    } else if (old.message !== s.message) {
      await prisma.alert.update({ where: { id: old.id }, data: { message: s.message } });
    }
  }
  return { created, resolved };
}

// 화면을 열 때 호출 — 1분 안에 이미 맞췄으면 건너뜀
let lastSync = 0;
export async function syncAlertsIfStale() {
  if (Date.now() - lastSync < 60_000) return;
  lastSync = Date.now();
  await syncAlerts();
}

// 해제되지 않은 알림 목록 (심각도 → 최신순)
export async function loadOpenAlerts(): Promise<AlertView[]> {
  const rows = await prisma.alert.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  return rows
    .map((a) => ({
      id: a.id,
      type: a.type,
      level: a.level,
      customerId: a.customerId,
      customerName: a.customer?.name ?? null,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
