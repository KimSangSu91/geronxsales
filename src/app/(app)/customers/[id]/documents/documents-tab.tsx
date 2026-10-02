"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Loader2, Plus, Replace, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/form";
import {
  ACCEPT_ATTR,
  DOCUMENT_BUCKET,
  fileProblem,
  FIXED_SLOTS,
  SLOT_CONFIG,
  TITLE_MAX,
  titleProblem,
  type TabSlot,
} from "@/lib/document-rules";
import { formatDate } from "@/lib/date";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { completeUpload, deleteDocument, getFileUrl, prepareUpload } from "./actions";
import type { DocumentsTabData, DocView } from "./documents-shared";

// 업로드: 서버에서 1회성 토큰 → 브라우저가 Storage에 직접 올리기 → 서버에 정보 저장
async function uploadFile(customerId: string, slot: TabSlot, file: File, opts: { replaceId?: string; title?: string }) {
  const problem = fileProblem(file);
  if (problem) return toast.error(problem), false;
  const prep = await prepareUpload(customerId, slot, { name: file.name, size: file.size, type: file.type }, opts.replaceId, opts.title);
  if (!prep.ok) return toast.error(prep.message), false;
  const { error } = await createClient()
    .storage.from(DOCUMENT_BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
  if (error) return toast.error("업로드하지 못했습니다. 다시 시도하세요."), false;
  const r = await completeUpload(customerId, { slot, path: prep.path, fileName: file.name, title: opts.title, replaceId: opts.replaceId });
  if (!r.ok) return toast.error(r.message), false;
  toast.success(opts.replaceId ? "파일을 교체했습니다" : "파일을 올렸습니다");
  return true;
}

async function downloadFile(id: string) {
  const r = await getFileUrl(id, "download");
  if (!r.ok) return toast.error(r.message);
  window.location.href = r.url;
}

type Row = { key: string; slot: TabSlot; name: string; kind: "필수" | "선택" | "추가"; doc: DocView | null; disabledReason?: string };

// 문서 탭 (화면정의서 4-5): 서류 1개 = 1행, 항목당 파일 1개
export function DocumentsTab({ customerId, data }: { customerId: string; data: DocumentsTabData }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [addError, setAddError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<{ row: Row; replace: boolean } | null>(null);

  const rows: Row[] = [
    ...FIXED_SLOTS.map((slot) => ({
      key: slot,
      slot,
      name: SLOT_CONFIG[slot].label,
      kind: SLOT_CONFIG[slot].required ? ("필수" as const) : ("선택" as const),
      doc: data.fixed[slot] ?? null,
      disabledReason: slot === "CONTRACT" && !data.hasContract ? "계약을 먼저 등록하세요 (계약·비용 탭)" : undefined,
    })),
    ...data.extra.map((d) => ({ key: d.id, slot: "ETC" as const, name: d.title ?? "추가 자료", kind: "추가" as const, doc: d })),
  ];

  const pick = (row: Row, replace: boolean) => {
    target.current = { row, replace };
    fileInput.current?.click();
  };

  const onPicked = async (file: File | undefined) => {
    const t = target.current;
    if (!file || !t) return;
    setBusy(t.row.key);
    await uploadFile(customerId, t.row.slot, file, { replaceId: t.replace ? t.row.doc?.id : undefined });
    setBusy(null);
  };

  const addExtra = async () => {
    const problem = titleProblem(newTitle) ?? (newFile ? fileProblem(newFile) : "파일을 선택하세요.");
    if (problem) return setAddError(problem);
    setBusy("__new");
    const ok = await uploadFile(customerId, "ETC", newFile!, { title: newTitle.trim() });
    setBusy(null);
    if (ok) {
      setAdding(false);
      setNewTitle("");
      setNewFile(null);
    }
  };

  const th = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
  const td = "px-3 py-2.5 align-middle";

  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-semibold">문서</h3>
        <span className="text-xs text-muted-foreground">PDF·이미지만 · 항목당 파일 1개 · 최대 20MB</span>
      </div>
      <div className="overflow-x-auto">
        {/* 열 폭 고정: 긴 파일명·서류명이 표를 밀어내지 않도록 (넘치면 … 처리, 마우스를 올리면 전체 이름) */}
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-14" />
            <col className="w-24" />
            <col />
            <col className="w-32" />
            <col className="w-48" />
          </colgroup>
          <thead className="border-b bg-muted/30">
            <tr>
              <th className={th}>서류명</th>
              <th className={th}>구분</th>
              <th className={th}>등록</th>
              <th className={th}>파일명</th>
              <th className={th}>업로드</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className={cn(td, "truncate font-medium")} title={r.name}>
                  {r.name}
                </td>
                <td className={td}>
                  <span className={cn("text-xs", r.kind === "필수" ? "font-medium text-red-600" : "text-muted-foreground")}>{r.kind}</span>
                </td>
                <td className={td}>
                  {r.doc ? (
                    <span className="text-xs text-emerald-700">● 등록됨</span>
                  ) : (
                    <span className={cn("text-xs", r.kind === "필수" ? "text-red-600" : "text-muted-foreground")}>○ 미등록</span>
                  )}
                </td>
                <td className={td}>
                  {r.doc ? (
                    <span className="block truncate" title={r.doc.fileName}>
                      {r.doc.fileName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className={cn(td, "truncate text-xs text-muted-foreground")} title={r.doc ? `${r.doc.uploadedBy} · ${r.doc.uploadedAt}` : undefined}>
                  {/* 날짜는 일 단위까지 (전체 일시는 마우스를 올리면) */}
                  {r.doc ? `${r.doc.uploadedBy} · ${formatDate(r.doc.uploadedAt.slice(0, 10))}` : "-"}
                </td>
                <td className={cn(td, "text-right whitespace-nowrap")}>
                  {busy === r.key ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> 올리는 중…
                    </span>
                  ) : r.doc ? (
                    <>
                      <Button variant="ghost" size="xs" onClick={() => downloadFile(r.doc!.id)}>
                        <Download />
                        다운
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setReplacing(r)}>
                        <Replace />
                        교체
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setDeleting(r)}>
                        <Trash2 />
                        삭제
                      </Button>
                    </>
                  ) : r.disabledReason ? (
                    <span className="text-xs text-muted-foreground">{r.disabledReason}</span>
                  ) : (
                    <Button variant="outline" size="xs" onClick={() => pick(r, false)} disabled={!!busy}>
                      <Upload />
                      업로드
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t px-5 py-3">
        <span className="text-xs text-muted-foreground">입소자 명단은 개인정보라 열람·다운로드할 때마다 히스토리에 기록됩니다.</span>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={!!busy}>
          <Plus />
          자료 추가
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        hidden
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          onPicked(file);
        }}
      />

      {/* 자료 추가: 서류명 직접 입력 + 파일 1개 */}
      <Dialog open={adding} onOpenChange={(o) => busy !== "__new" && setAdding(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>자료 추가</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field label="서류명" required>
              <Input
                value={newTitle}
                maxLength={TITLE_MAX}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  setAddError(undefined);
                }}
                placeholder="예) 설치 사진, 견적서"
              />
            </Field>
            <Field label="파일" required hint={<span className="text-xs text-muted-foreground">PDF·이미지 · 최대 20MB</span>}>
              <input
                type="file"
                accept={ACCEPT_ATTR}
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1 file:text-sm"
                onChange={(e) => {
                  setNewFile(e.target.files?.[0] ?? null);
                  setAddError(undefined);
                }}
              />
            </Field>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)} disabled={busy === "__new"}>
              취소
            </Button>
            <Button onClick={addExtra} disabled={busy === "__new"}>
              {busy === "__new" && <Loader2 className="animate-spin" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 교체: 경고 후 파일 선택 (기존 파일은 보관하지 않음) */}
      <ConfirmDialog
        open={!!replacing}
        onOpenChange={(o) => !o && setReplacing(null)}
        title={`${replacing?.name ?? ""} 교체`}
        description={`기존 파일(${replacing?.doc?.fileName ?? ""})은 삭제되며 복구할 수 없습니다. 새 파일을 선택하세요.`}
        confirmLabel="새 파일 선택"
        destructive
        onConfirm={() => {
          const r = replacing!;
          setReplacing(null);
          pick(r, true);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`${deleting?.name ?? ""} 삭제`}
        description={
          deleting && (
            <>
              {deleting.doc?.fileName}을(를) 삭제합니다. 복구할 수 없습니다.
              {deleting.kind === "추가" && " 이 자료 행도 함께 없어집니다."}
              {deleting.kind === "필수" && (
                <b className="mt-1 block text-red-700">필수 서류입니다. 삭제해도 고객사 상태는 바뀌지 않습니다.</b>
              )}
            </>
          )
        }
        confirmLabel="삭제"
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const r = await deleteDocument(deleting!.doc!.id);
            setDeleting(null);
            if (r.ok) toast.success("파일을 삭제했습니다");
            else toast.error(r.message);
          })
        }
      />
    </section>
  );
}
