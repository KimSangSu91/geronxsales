-- Prisma 마이그레이션 기록 표도 Supabase API로 노출되지 않도록 RLS 켜기
-- IF EXISTS: prisma migrate dev의 검증용 임시 DB(shadow)에는 이 표가 없음
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
