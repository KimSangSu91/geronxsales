// Supabase Storage 비공개 버킷 만들기/설정 갱신 (여러 번 실행해도 안전)
// 실행: npx tsx scripts/setup-storage.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createClient } from "@supabase/supabase-js";
import { ALLOWED_TYPES, DOCUMENT_BUCKET, MAX_FILE_MB } from "../src/lib/document-rules";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const options = {
  public: false, // 비공개: 열람은 만료 링크(signed URL)로만
  fileSizeLimit: MAX_FILE_MB * 1024 * 1024, // 화면·서버 검사(lib/document-rules.ts)와 같은 바이트 수
  allowedMimeTypes: Object.keys(ALLOWED_TYPES),
};

async function main() {
  const { data: existing } = await supabase.storage.getBucket(DOCUMENT_BUCKET);
  const { error } = existing
    ? await supabase.storage.updateBucket(DOCUMENT_BUCKET, options)
    : await supabase.storage.createBucket(DOCUMENT_BUCKET, options);
  if (error) throw error;

  const { data } = await supabase.storage.getBucket(DOCUMENT_BUCKET);
  console.log(`${existing ? "설정 갱신" : "생성"}: ${DOCUMENT_BUCKET}`, {
    public: data?.public,
    fileSizeLimit: data?.file_size_limit,
    allowedMimeTypes: data?.allowed_mime_types,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
