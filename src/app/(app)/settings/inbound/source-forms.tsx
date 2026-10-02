"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { copyText } from "@/components/copy-button";
import { Field, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUnsavedChanges, UnsavedChangesProvider } from "@/components/unsaved-changes";
import { INQUIRY_FIELDS, targetOf, type MappingTarget } from "@/lib/inbound-fields";
import { createSource, regenerateToken, updateSource } from "./actions";

type Owner = { id: string; name: string };

export function AddSourceButton({ owners }: { owners: Owner[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        경로 추가
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>문의 수신 경로 추가</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="이름" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 외부 세일즈 A팀 폼" />
            </Field>
            <Field label="기본 내부 담당자">
              <select className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">지정 안 함</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button
              disabled={pending || !name.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await createSource(name, ownerId || null);
                  if (!r.ok) return void toast.error(r.message);
                  router.push(`/settings/inbound/${r.id}`);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type SourceView = {
  id: string;
  version: number;
  name: string;
  isActive: boolean;
  defaultOwnerId: string | null;
  token: string;
  mapping: Record<string, string>;
  questions: string[];
};

export function SourceEditor(props: { source: SourceView; samples: Record<string, string>; owners: Owner[]; endpoint: string }) {
  return (
    <UnsavedChangesProvider>
      <Editor {...props} />
    </UnsavedChangesProvider>
  );
}

function Editor({ source, samples, owners, endpoint }: { source: SourceView; samples: Record<string, string>; owners: Owner[]; endpoint: string }) {
  const router = useRouter();
  const initial = {
    name: source.name,
    isActive: source.isActive,
    defaultOwnerId: source.defaultOwnerId ?? "",
    mapping: Object.fromEntries(source.questions.map((q) => [q, targetOf(source.mapping as Record<string, MappingTarget>, q)])),
  };
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [showScript, setShowScript] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedChanges("inbound-source", dirty);

  const save = () =>
    startTransition(async () => {
      const r = await updateSource(source.id, source.version, { ...form, defaultOwnerId: form.defaultOwnerId || null });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.reapplied ? `저장했습니다 · 미처리 문의 ${r.reapplied}건에 다시 적용` : "저장했습니다");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h2>기본 설정</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-3">
          <Field label="이름" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="기본 내부 담당자">
            <select className={selectClass} value={form.defaultOwnerId} onChange={(e) => setForm({ ...form, defaultOwnerId: e.target.value })}>
              <option value="">지정 안 함</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="수신">
            <select className={selectClass} value={form.isActive ? "on" : "off"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "on" })}>
              <option value="on">수신 중</option>
              <option value="off">중지</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h2>
            질문 연결 <span className="text-sm font-normal text-muted-foreground">{source.questions.length}개</span>
          </h2>
        </div>
        {source.questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">첫 응답이 들어오면 구글폼 질문이 여기에 표시됩니다</p>
        ) : (
          <table className="data-table w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[38%]" />
              <col />
              <col className="w-52" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th>구글폼 질문</th>
                <th>최근 답변</th>
                <th>문의 항목</th>
              </tr>
            </thead>
            <tbody>
              {source.questions.map((q) => (
                <tr key={q} className="border-b last:border-0">
                  <td className="truncate font-medium" title={q}>
                    {q}
                  </td>
                  <td className="truncate text-muted-foreground" title={samples[q]}>
                    {samples[q] ?? "-"}
                  </td>
                  <td>
                    <select
                      className={selectClass}
                      value={form.mapping[q]}
                      onChange={(e) => setForm({ ...form, mapping: { ...form.mapping, [q]: e.target.value as MappingTarget } })}
                    >
                      {Object.entries(INQUIRY_FIELDS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                      <option value="none">연결 안 함 (내용에 덧붙임)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-end border-t px-5 py-3">
          <Button onClick={save} disabled={pending || !dirty || !form.name.trim()}>
            {pending && <Loader2 className="animate-spin" />}
            저장
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-background">
        <div className="card-head">
          <h2>구글폼 연결</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(true)}>
              <RefreshCw />
              코드 재발급
            </Button>
            <Button size="sm" onClick={() => setShowScript(true)}>
              연결 방법
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-y-3 px-5 py-4 text-sm">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-muted-foreground">연결 코드</dt>
            <dd className="font-mono">{source.token.slice(0, 6)}••••••••••••</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-muted-foreground">수신 주소</dt>
            <dd className="font-mono break-all">{endpoint}</dd>
          </div>
        </dl>
      </section>

      <ScriptDialog open={showScript} onOpenChange={setShowScript} endpoint={endpoint} token={source.token} />
      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        title="연결 코드 재발급"
        description="기존 코드를 넣은 구글폼은 더 이상 수신되지 않습니다. 새 스크립트로 다시 연결해야 합니다."
        confirmLabel="재발급"
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            await regenerateToken(source.id);
            setConfirmRegen(false);
            toast.success("연결 코드를 재발급했습니다");
            router.refresh();
          })
        }
      />
    </div>
  );
}

// 구글폼 Apps Script — 모든 폼에 같은 코드, 연결 코드(TOKEN)만 다름
function scriptText(endpoint: string, token: string) {
  return `// 늘케어 고객관리 — 구글폼 응답 전송
const ENDPOINT = "${endpoint}";
const TOKEN = "${token}";

// 1) 처음 한 번 실행: 응답이 제출될 때마다 자동 전송되도록 연결
function setup() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "onFormSubmit")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onFormSubmit").forForm(form).onFormSubmit().create();
}

// 2) (선택) 이미 받은 응답을 모두 보내기 — 같은 응답은 한 번만 저장됨
function sendExistingResponses() {
  FormApp.getActiveForm().getResponses().forEach(send_);
}

function onFormSubmit(e) {
  send_(e.response);
}

function send_(response) {
  const answers = response.getItemResponses().map((r) => {
    const a = r.getResponse();
    return { question: r.getItem().getTitle(), answer: Array.isArray(a) ? a.flat().join(", ") : String(a) };
  });
  UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      token: TOKEN,
      responseId: response.getId(),
      submittedAt: response.getTimestamp().toISOString(),
      formTitle: FormApp.getActiveForm().getTitle(),
      respondentEmail: response.getRespondentEmail(),
      answers: answers,
    }),
  });
}
`;
}

function ScriptDialog({ open, onOpenChange, endpoint, token }: { open: boolean; onOpenChange: (o: boolean) => void; endpoint: string; token: string }) {
  const code = scriptText(endpoint, token);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>구글폼 연결 방법</DialogTitle>
        </DialogHeader>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>구글폼 편집 화면 오른쪽 위 ⋮ → <b>스크립트 편집기</b> (Apps Script)</li>
          <li>
            편집기의 코드를 모두 지우고 아래 코드를 붙여넣기 → <b>저장</b>(💾)
          </li>
          <li>
            위쪽 함수 선택에서 <b>setup</b> 선택 → <b>실행</b> → 권한 검토 → 계정 선택 → <b>고급</b> → <b>(안전하지 않음)으로 이동</b> → <b>허용</b>
          </li>
          <li>
            이미 받은 응답도 가져오려면 <b>sendExistingResponses</b> 선택 → <b>실행</b>
          </li>
          <li>폼을 한 번 제출해 보고, 이 화면을 새로고침해 질문 연결을 확인</li>
        </ol>
        <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">{code}</pre>
        <DialogFooter>
          <Button onClick={() => copyText(code, "스크립트를 복사했습니다")}>코드 복사</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
