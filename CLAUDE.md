# 늘케어 고객관리 시스템 (neulcaresalse)

엑셀(고객관리.xlsx)로 하던 늘케어 고객사 관리를 웹 시스템으로 옮기는 사내 프로젝트.
사용자는 기획자(비개발자)다. 명령어·개념은 쉬운 말로 설명하고, 사용자가 직접 할 일은 클릭 단위로 안내할 것.

## 문서 (구현 전 해당 부분을 반드시 읽기)
- docs/기능정의서.md — 규칙·로직의 기준 (문서끼리 다르면 이것이 우선)
- docs/화면정의서_고객사.md — 화면 구성·버튼·모달
- docs/데이터모델.md, prisma/schema.prisma — 데이터 구조
- docs/이관매핑표.md — 엑셀 이관 규칙
- docs/*.docx 는 사람이 보는 참고본. 기준은 md 파일
문서와 다르게 구현해야 할 이유가 있으면 구현 전에 먼저 물어볼 것.

## 스택
Next.js(App Router) + TypeScript, Supabase(Auth·Storage, 리전 Seoul), Prisma 7(Postgres), Tailwind + shadcn/ui, Vercel(리전 icn1)
개발 환경: Windows

## 규칙
- UI 문구는 한국어, 코드·변수명은 영어
- 데이터 변경은 Server Action, 외부 호출(cron·구글폼)만 Route Handler
- 모든 Server Action은 로그인·활성 사용자 확인부터 (관리자 기능은 role 확인)
- 금액: 공급가 Int(원)로 저장, VAT 포함 = floor(공급가 × 1.1)은 표시할 때만 계산 (lib/money.ts)
- 날짜: 업무 날짜는 KST 기준 'YYYY-MM-DD'로 다룸, @db.Date 변환은 lib/date.ts만 사용
- Vercel Cron은 UTC 기준. 월 청구 건 생성도 매일 배치에서 처리(이미 있으면 건너뜀)
- 히스토리: 데이터 변경 시 lib/history.ts로 같은 트랜잭션 안에서 기록
- 동시 편집: version 컬럼이 있는 테이블은 lib/optimistic.ts로 저장 (덮어쓰기 금지)
- 삭제 금지: Customer, User, 자동 History — 삭제 기능을 만들지 않음
- 상태 전환 필수 항목은 lib/status-rules.ts 한 곳에서만 정의 (화면·서버 공용)
- 민감정보(와이파이·서비스 계정 비밀번호)는 lib/crypto.ts(AES-GCM)로 암호화, 조회 시 히스토리 기록, 엑셀 내보내기 제외
- 날짜 입력은 항상 Date Picker 컴포넌트
- public 테이블은 RLS를 켜고 정책을 두지 않음 (DB 접근은 서버의 Prisma로만)
- 파일 업로드는 브라우저 → Supabase Storage 직접 업로드(signed upload URL), 서버에는 메타정보만 저장
- .env* 파일과 고객관리.xlsx는 git에 올리지 않음

## 작업 방식
- 기능 1개 단위로 작게: 계획을 먼저 보여주고 승인 후 구현 → 타입체크·빌드 통과 → 커밋
- 끝나면 사용자가 브라우저에서 직접 확인할 테스트 시나리오를 3~5줄로 알려줄 것
- schema.prisma를 바꾸면 docs/데이터모델.md도 함께 수정
- 사용자가 해야 하는 외부 작업(Supabase·Vercel 화면 설정 등)은 단계별로 안내하고 완료를 확인받은 뒤 진행

## 진행 순서
0 셋업·로그인·레이아웃·시드 → 1 고객사(리스트·등록·상세·히스토리·상태 변경·체크리스트·엑셀 이관) → 2 계약·비용·체험·갱신·문서 → 3 알림·대시보드·청구·회수 체크리스트 → 4 인바운드·사용자 관리·마이페이지·엑셀 내보내기 → 5 엑셀 병행 후 전환

## Next.js 버전 안내
@AGENTS.md
