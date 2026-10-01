-- Prisma 마이그레이션 기록 표도 Supabase API로 노출되지 않도록 RLS 켜기
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
