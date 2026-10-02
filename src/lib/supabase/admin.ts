import "server-only";
import { createClient } from "@supabase/supabase-js";

// 서버 전용 Supabase 관리 클라이언트 (Storage 업로드 링크·열람 링크·삭제)
// 비밀 키를 쓰므로 브라우저 코드에서 import 금지
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
