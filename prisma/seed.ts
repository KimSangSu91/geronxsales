// 기본 데이터: 체크리스트 항목 · 설정 기본값 · 첫 관리자 계정
// 실행: npx prisma db seed  (여러 번 실행해도 안전 — 있으면 건너뛰거나 갱신)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient, ChecklistKind, UserRole } from "../src/generated/prisma/client";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "sskim@geronx.ai";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "관리자";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
});

// 기능정의서 4-7(도입 11) · 4-5-2(회수·종료 4)
const checklistItems: { kind: ChecklistKind; code: string; label: string }[] = [
  { kind: "ONBOARDING", code: "resident_info", label: "입소자 정보" },
  { kind: "ONBOARDING", code: "facility_info", label: "시설 정보(wifi 등)" },
  { kind: "ONBOARDING", code: "site_plan", label: "조감도" },
  { kind: "ONBOARDING", code: "privacy_consent", label: "개인정보 동의" },
  { kind: "ONBOARDING", code: "contract_signed", label: "계약서 날인" },
  { kind: "ONBOARDING", code: "device_mapping", label: "장비 매핑" },
  { kind: "ONBOARDING", code: "account_created", label: "계정 생성" },
  { kind: "ONBOARDING", code: "band_labeling", label: "밴드 라벨링" },
  { kind: "ONBOARDING", code: "installation", label: "설치" },
  { kind: "ONBOARDING", code: "qa", label: "QA" },
  { kind: "ONBOARDING", code: "tablet_tv", label: "태블릿&TV" },
  { kind: "CLOSING", code: "recovery", label: "장비 회수" },
  { kind: "CLOSING", code: "account_deactivation", label: "늘케어 계정 비활성화" },
  { kind: "CLOSING", code: "privacy_disposal", label: "입소자 명단 등 개인정보 파기" },
  { kind: "CLOSING", code: "final_invoice", label: "최종 청구 확인" },
];

// 기능정의서 4-10 알림 기준 기본값 · 4-8 파일 크기
const settings: Record<string, number> = {
  "alert.renewal_days": 60, // 갱신 확인 필요: 계약 종료일 D-60
  "alert.pending_stale_days": 14, // 진행대기 장기 체류: 마지막 활동 후 14일
  "alert.trial_end_days": 7, // 체험 종료 확인 필요: 체험 종료일 D-7
  "alert.recovery_days": 14, // 장비 미회수: 회수·종료 체크리스트 미완료 14일
  "alert.inquiry_days": 3, // 미처리 문의: 접수 후 3일
  "alert.invoice_days": 5, // 청구 미처리: 청구일 + 5일
  "file.max_mb": 20, // 파일 1개 최대 20MB
};

async function seedChecklistItems() {
  for (const [i, item] of checklistItems.entries()) {
    await prisma.checklistItem.upsert({
      where: { code: item.code },
      create: { ...item, sortOrder: i + 1 },
      update: { label: item.label, kind: item.kind, sortOrder: i + 1 },
    });
  }
  console.log(`체크리스트 항목 ${checklistItems.length}개`);
}

async function seedSettings() {
  // 이미 있는 설정값은 사용자가 바꿨을 수 있으므로 덮어쓰지 않음
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  console.log(`설정 기본값 ${Object.keys(settings).length}개`);
}

async function seedAdmin() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let authId: string | undefined;
  let tempPassword: string | undefined;

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  authId = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())?.id;

  if (!authId) {
    tempPassword = randomBytes(9).toString("base64url");
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: tempPassword,
      email_confirm: true,
    });
    if (error) throw error;
    authId = data.user.id;
  }

  await prisma.user.upsert({
    where: { id: authId },
    create: { id: authId, email: ADMIN_EMAIL, name: ADMIN_NAME, role: UserRole.ADMIN },
    update: { role: UserRole.ADMIN, isActive: true },
  });

  if (tempPassword) {
    console.log(`\n관리자 계정 생성: ${ADMIN_EMAIL}`);
    console.log(`임시 비밀번호: ${tempPassword}   ← 지금만 표시됩니다. 로그인 후 변경하세요.\n`);
  } else {
    console.log(`관리자 계정 확인: ${ADMIN_EMAIL} (이미 있음, 비밀번호 변경 없음)`);
  }
}

async function main() {
  await seedChecklistItems();
  await seedSettings();
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
