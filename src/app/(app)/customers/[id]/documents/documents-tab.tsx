"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert, Download, Eye, FileText, Grid2x2, ImageIcon, List, Loader2, Replace, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { selectClass } from "@/components/form";
import type { EtcCategory } from "@/generated/prisma/enums";
import { ACCEPT_ATTR, DOCUMENT_BUCKET, ETC_CATEGORY_LABEL, fileProblem, formatSize, SLOT_CONFIG, type TabSlot } from "@/lib/document-rules";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { completeUpload, deleteDocument, getEtcUrls, getFileUrl, prepareUpload } from "./actions";
import { missingRequired, type DocumentsTabData, type DocView } from "./documents-shared";

// ───────── 업로드: 서버에서 토큰 받기 → 브라우저가 Storage에 직접 올리기 → 서버에 정보 저장 ─────────

function useUpload(customerId: string) {
  const [busy, setBusy] = useState<string | null>(null); // 진행 중인 슬롯 키

  const upload = async (key: string, slot: TabSlot, files: File[], opts: { replaceId?: string; etcCategory?: EtcCategory } = {}) => {
    if (!files.length) return;
    setBusy(key);
    let okCount = 0;
    try {
      for (const file of files) {
        const problem = fileProblem(file);
        if (problem) {
          toast.error(`${file.name}: ${problem}`);
          continue;
        }
        const prep = await prepareUpload(customerId, slot, { name: file.name, size: file.size, type: file.type }, opts.replaceId);
        if (!prep.ok) {
          toast.error(prep.message);
          continue;
        }
        const { error } = await createClient()
          .storage.from(DOCUMENT_BUCKET)
          .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
        if (error) {
          toast.error(`${file.name}: 업로드하지 못했습니다. 다시 시도하세요.`);
          continue;
        }
        const r = await completeUpload(customerId, {
          slot,
          path: prep.path,
          fileName: file.name,
          etcCategory: opts.etcCategory,
          replaceId: opts.replaceId,
        });
        if (!r.ok) toast.error(r.message);
        else okCount++;
      }
      if (okCount) toast.success(opts.replaceId ? "파일을 교체했습니다" : `${okCount}개 파일을 올렸습니다`);
    } finally {
      setBusy(null);
    }
  };
  return { busy, upload };
}

async function openFile(id: string, mode: "view" | "download") {
  const r = await getFileUrl(id, mode);
  if (!r.ok) return toast.error(r.message);
  if (mode === "view") window.open(r.url, "_blank", "noopener");
  else window.location.href = r.url;
}

// 파일 선택창 + 끌어다 놓기 영역
function DropZone({
  onFiles,
  multiple,
  busy,
  disabledReason,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  busy?: boolean;
  disabledReason?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (disabledReason) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabledReason && !busy) onFiles(Array.from(e.dataTransfer.files).slice(0, multiple ? 20 : 1));
      }}
      className={cn("flex flex-col items-center justify-center gap-2 rounded-md p-4 text-sm text-muted-foreground", over && "bg-muted", className)}
    >
      {children}
      {busy ? (
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-4 animate-spin" /> 올리는 중…
        </span>
      ) : disabledReason ? (
        <span>{disabledReason}</span>
      ) : (
        <>
          <span>파일을 끌어다 놓거나</span>
          <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
            <Upload />
            파일 선택
          </Button>
          <span className="text-xs">PDF·이미지 · 최대 20MB</span>
        </>
      )}
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function FileActions({
  doc,
  onReplace,
  onDelete,
}: {
  doc: DocView;
  onReplace?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5">
      <Button variant="ghost" size="xs" onClick={() => openFile(doc.id, "view")}>
        <Eye />
        보기
      </Button>
      <Button variant="ghost" size="xs" onClick={() => openFile(doc.id, "download")}>
        <Download />
        다운
      </Button>
      {onReplace && (
        <Button variant="ghost" size="xs" onClick={onReplace}>
          <Replace />
          교체
        </Button>
      )}
      <Button variant="ghost" size="xs" onClick={onDelete}>
        <Trash2 />
        삭제
      </Button>
    </div>
  );
}

// 단일 서류 카드 (계약서·인수증·사업자등록증·통장사본·입소자 명단)
function SlotCard({
  slot,
  doc,
  busy,
  disabledReason,
  onUpload,
  onReplace,
  onDelete,
}: {
  slot: TabSlot;
  doc: DocView | null;
  busy: boolean;
  disabledReason?: string;
  onUpload: (files: File[]) => void;
  onReplace: (doc: DocView) => void;
  onDelete: (doc: DocView) => void;
}) {
  const cfg = SLOT_CONFIG[slot];
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-background",
        !doc && cfg.required && "border-2 border-dashed border-red-300",
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="font-medium">
          {cfg.label}
          {cfg.required && <span className="ml-1 text-xs text-red-600">필수</span>}
        </span>
        <span className={cn("text-xs", doc ? "text-emerald-700" : "text-muted-foreground")}>{doc ? "● 등록됨" : "○ 미등록"}</span>
      </div>
      {doc ? (
        <div className="flex flex-col gap-1 px-4 py-3 text-sm">
          <p className="flex items-center gap-1.5 truncate font-medium" title={doc.fileName}>
            {doc.mimeType.startsWith("image/") ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
            <span className="truncate">{doc.fileName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {doc.uploadedBy} · {doc.uploadedAt} · {formatSize(doc.size)}
          </p>
          {busy ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> 교체하는 중…
            </span>
          ) : (
            <FileActions doc={doc} onReplace={() => onReplace(doc)} onDelete={() => onDelete(doc)} />
          )}
        </div>
      ) : (
        <DropZone onFiles={onUpload} busy={busy} disabledReason={disabledReason} className="min-h-32" />
      )}
    </div>
  );
}

// 여러 파일 목록 (도면·기타 자료)
function FileTable({ docs, onDelete, showCategory }: { docs: DocView[]; onDelete: (d: DocView) => void; showCategory?: boolean }) {
  if (!docs.length) return <p className="py-6 text-center text-sm text-muted-foreground">등록된 파일이 없습니다</p>;
  const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className={th}>파일명</th>
            {showCategory && <th className={th}>분류</th>}
            <th className={th}>크기</th>
            <th className={th}>업로드자</th>
            <th className={th}>일시</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b last:border-0">
              <td className="max-w-64 truncate px-3 py-2" title={d.fileName}>
                {d.fileName}
              </td>
              {showCategory && <td className="px-3 py-2">{d.etcCategory ? ETC_CATEGORY_LABEL[d.etcCategory] : "-"}</td>}
              <td className="px-3 py-2 tabular-nums">{formatSize(d.size)}</td>
              <td className="px-3 py-2">{d.uploadedBy}</td>
              <td className="px-3 py-2 tabular-nums">{d.uploadedAt}</td>
              <td className="px-3 py-1 text-right">
                <FileActions doc={d} onDelete={() => onDelete(d)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 설치 사진 등 이미지 썸네일
function ThumbGrid({ customerId, docs, onDelete }: { customerId: string; docs: DocView[]; onDelete: (d: DocView) => void }) {
  const images = docs.filter((d) => d.mimeType.startsWith("image/"));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = images.map((d) => d.id).join(",");
  // 썸네일용 임시 링크 (이미지 목록이 바뀔 때만 다시 받음)
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getEtcUrls(customerId, key.split(","), false).then((list) => {
      if (!cancelled) setUrls(Object.fromEntries(list.map((x) => [x.id, x.url])));
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, key]);
  if (!images.length) return <p className="py-6 text-center text-sm text-muted-foreground">이미지 파일이 없습니다</p>;
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((d) => (
        <div key={d.id} className="group relative overflow-hidden rounded-md border">
          <button type="button" onClick={() => openFile(d.id, "view")} className="block aspect-square w-full bg-muted">
            {urls[d.id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- 비공개 저장소 임시 링크라 next/image 최적화 대상 아님
              <img src={urls[d.id]} alt={d.fileName} className="h-full w-full object-cover" />
            ) : (
              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
            )}
          </button>
          <div className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
            <span className="truncate" title={d.fileName}>
              {d.fileName}
            </span>
            <button type="button" title="삭제" onClick={() => onDelete(d)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// 문서 탭 (화면정의서 4-5)
export function DocumentsTab({ customerId, data }: { customerId: string; data: DocumentsTabData }) {
  const { busy, upload } = useUpload(customerId);
  const [replacing, setReplacing] = useState<DocView | null>(null);
  const [deleting, setDeleting] = useState<DocView | null>(null);
  const [etcFilter, setEtcFilter] = useState<"ALL" | EtcCategory>("ALL");
  const [etcCategory, setEtcCategory] = useState<EtcCategory>("INSTALL_PHOTO");
  const [etcView, setEtcView] = useState<"list" | "grid">("list");
  const [zipping, setZipping] = useState(false);
  const [pending, startTransition] = useTransition();
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<DocView | null>(null);

  const missing = missingRequired(data);
  const warnMissing = (data.status === "ONBOARDING" || data.status === "ACTIVE") && missing.length > 0;
  const etcDocs = data.etc.filter((d) => etcFilter === "ALL" || d.etcCategory === etcFilter);

  const card = (slot: TabSlot, doc: DocView | null, disabledReason?: string) => (
    <SlotCard
      key={slot}
      slot={slot}
      doc={doc}
      busy={busy === slot}
      disabledReason={disabledReason}
      onUpload={(files) => upload(slot, slot, files)}
      onReplace={setReplacing}
      onDelete={setDeleting}
    />
  );

  const downloadZip = async () => {
    if (!etcDocs.length) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const links = await getEtcUrls(customerId, etcDocs.map((d) => d.id), true);
      const used = new Set<string>();
      for (const l of links) {
        const blob = await fetch(l.url).then((r) => r.blob());
        let name = l.fileName;
        for (let i = 2; used.has(name); i++) name = l.fileName.replace(/(\.[^.]*)?$/, ` (${i})$1`);
        used.add(name);
        zip.file(name, blob);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "기타자료.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("압축 파일을 만들지 못했습니다.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {warnMissing && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <CircleAlert className="size-4 shrink-0" />
          필수 서류가 누락되었습니다: {missing.join(", ")}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">필수 서류</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {card("CONTRACT", data.contract, data.hasContract ? undefined : "계약을 먼저 등록하세요 (계약·비용 탭)")}
          {card("DEVICE_RECEIPT", data.deviceReceipt)}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">선택 서류</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {card("BIZ_REGISTRATION", data.bizRegistration)}
          {card("BANKBOOK", data.bankbook)}
          {card("RESIDENT_LIST", data.residentList)}
        </div>
        <div className="rounded-lg border bg-background">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-medium">
              도면 <span className="text-sm font-normal text-muted-foreground">{data.drawings.length}개</span>
            </span>
          </div>
          <FileTable docs={data.drawings} onDelete={setDeleting} />
          <DropZone multiple onFiles={(f) => upload("DRAWING", "DRAWING", f)} busy={busy === "DRAWING"} className="border-t" />
        </div>
        <p className="text-xs text-muted-foreground">입소자 명단은 개인정보라 열람·다운로드할 때마다 히스토리에 기록됩니다.</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            기타 자료 <span className="text-sm font-normal text-muted-foreground">{data.etc.length}개</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5 text-sm">
              {(["ALL", "INSTALL_PHOTO", "OTHER"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setEtcFilter(f)}
                  className={cn("rounded-md px-2.5 py-0.5", etcFilter === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
                >
                  {f === "ALL" ? "전체" : ETC_CATEGORY_LABEL[f]}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border p-0.5">
              <button type="button" title="목록" onClick={() => setEtcView("list")} className={cn("rounded-md p-1", etcView === "list" ? "bg-muted" : "")}>
                <List className="size-4" />
              </button>
              <button type="button" title="썸네일" onClick={() => setEtcView("grid")} className={cn("rounded-md p-1", etcView === "grid" ? "bg-muted" : "")}>
                <Grid2x2 className="size-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={downloadZip} disabled={!etcDocs.length || zipping}>
              {zipping ? <Loader2 className="animate-spin" /> : <Download />}
              전체 다운로드(zip)
            </Button>
          </div>
        </div>
        <div className="rounded-lg border bg-background">
          {etcView === "grid" ? (
            <ThumbGrid customerId={customerId} docs={etcDocs} onDelete={setDeleting} />
          ) : (
            <FileTable docs={etcDocs} onDelete={setDeleting} showCategory />
          )}
          <div className="flex flex-col items-center gap-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">올릴 분류</span>
              <select className={cn(selectClass, "w-32")} value={etcCategory} onChange={(e) => setEtcCategory(e.target.value as EtcCategory)}>
                <option value="INSTALL_PHOTO">설치 사진</option>
                <option value="OTHER">기타</option>
              </select>
            </label>
            <DropZone multiple onFiles={(f) => upload("ETC", "ETC", f, { etcCategory })} busy={busy === "ETC"} />
          </div>
        </div>
      </section>

      {/* 교체: 경고 후 파일 선택 */}
      <ConfirmDialog
        open={!!replacing}
        onOpenChange={(o) => !o && setReplacing(null)}
        title={`${replacing ? SLOT_CONFIG[replacing.slot].label : ""} 교체`}
        description={`기존 파일(${replacing?.fileName ?? ""})은 삭제되며 복구할 수 없습니다. 새 파일을 선택하세요.`}
        confirmLabel="새 파일 선택"
        destructive
        onConfirm={() => {
          replaceTarget.current = replacing;
          setReplacing(null);
          replaceInput.current?.click();
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        hidden
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          const target = replaceTarget.current;
          const files = Array.from(e.target.files ?? []).slice(0, 1);
          e.target.value = "";
          if (target && files.length) upload(target.slot, target.slot, files, { replaceId: target.id });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="파일 삭제"
        description={
          deleting && (
            <>
              {deleting.fileName}을(를) 삭제합니다. 복구할 수 없습니다.
              {SLOT_CONFIG[deleting.slot].required && (
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
            const r = await deleteDocument(deleting!.id);
            setDeleting(null);
            if (r.ok) toast.success("파일을 삭제했습니다");
            else toast.error(r.message);
          })
        }
      />
    </div>
  );
}
