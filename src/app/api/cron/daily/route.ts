import { runDailyBatch } from "@/lib/daily-batch";

// 매일 배치 — Vercel Cron이 호출 (vercel.json: 매일 00:10 KST = UTC 15:10)
// Vercel은 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 호출함
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyBatch();
  return Response.json({ ok: true, ...result });
}
