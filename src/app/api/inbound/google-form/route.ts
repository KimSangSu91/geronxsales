import { receiveFormResponse } from "@/lib/inbound";

// 구글폼 응답 수신 (Apps Script onFormSubmit → POST). 인증: 경로별 연결 코드(token)
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON 형식이 아닙니다" }, { status: 400 });
  }
  const { status, body } = await receiveFormResponse((payload ?? {}) as Record<string, unknown>);
  return Response.json(body, { status });
}
