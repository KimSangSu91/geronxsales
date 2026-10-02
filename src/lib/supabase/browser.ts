"use client";

import { createBrowserClient } from "@supabase/ssr";

// 브라우저용 Supabase 클라이언트 — 파일을 Storage에 직접 올릴 때 사용 (서버가 발급한 업로드 토큰으로만 업로드)
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
