"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download, Loader2, Replace, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker } from "@/components/date-picker";
import { Field, selectClass } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { ACCEPT_ATTR, DOCUMENT_BUCKET, fileProblem } from "@/lib/document-rules";
import { CHARGE_TYPE_LABEL, INVOICE_STATUS_LABEL } from "@/lib/labels";
import { formatWon, withVat } from "@/lib/money";
import { createClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { getFileUrl } from "../customers/[id]/documents/actions";
import {
  adjustInvoice,
  completeTaxInvoiceUpload,
  deleteTaxInvoice,
  prepareTaxInvoiceUpload,
  updateInvoice,
} from "./invoice-actions";
import { finalAmount, type InvoiceRow } from "./invoice-shared";

// 상태 색 (화면정의서 7장): 청구 전 회색 / 청구 완료 연초록 / 입금 확인 진초록 / 미납 빨강
const STATUS_TONE: Record<InvoiceStatus, string> = {
  BEFORE: "border-zinc-200 bg-zinc-50 text-zinc-700",
  BILLED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAID: "border-emerald-600 bg-emerald-600 text-white",
  UNPAID: "border-red-200 bg-red-50 text-red-700",
};

const SOURCE = { CONTRACT: "계약", OPTION: "옵션상품", EXTRA: "추가 기기", MANUAL: "직접 추가" } as const;

// 청구 건 표 — 고객사 청구 탭·청구 관리 메뉴 공용 (화면정의서 4-3, 기능정의서 4-6)
export function InvoiceTable({ rows, showCustomer }: { rows: InvoiceRow[]; showCustomer?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<InvoiceRow | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjError, setAdjError] = useState<string>();
  const [deleting, setDeleting] = useState<InvoiceRow | null>(null);
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<InvoiceRow | null>(null);

  const save = (r: InvoiceRow, patch: Parameters<typeof updateInvoice>[2], success = "저장했습니다") =>
    startTransition(async () => {
      setBusy(r.id);
      const res = await updateInvoice(r.id, r.version, patch);
      setBusy(null);
      if (res.ok) toast.success(success);
      else {
        toast.error(res.message);
        if (res.conflict) router.refresh();
      }
    });

  const upload = async (file: File | undefined) => {
    const r = target.current;
    if (!file || !r) return;
    const problem = fileProblem(file);
    if (problem) return toast.error(problem);
    setBusy(r.id);
    try {
      const prep = await prepareTaxInvoiceUpload(r.id, { name: file.name, size: file.size, type: file.type });
      if (!prep.ok) return toast.error(prep.message);
      const { error } = await createClient().storage.from(DOCUMENT_BUCKET).uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) return toast.error("업로드하지 못했습니다. 다시 시도하세요.");
      const res = await completeTaxInvoiceUpload(r.id, prep.path, file.name);
      if (res.ok) toast.success(r.status === "BEFORE" ? "세금계산서를 올렸습니다 · 청구 완료로 변경" : "세금계산서를 올렸습니다");
      else toast.error(res.message);
    } finally {
      setBusy(null);
    }
  };

  const download = async (docId: string) => {
    const r = await getFileUrl(docId, "download");
    if (r.ok) window.location.href = r.url;
    else toast.error(r.message);
  };

  const th = "px-2 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5";
  const td = "px-2 py-2 align-middle first:pl-5 last:pr-5";

  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">청구 건이 없습니다</p>;

  return (
    <>
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-8" />
          {showCustomer && <col className="w-[16%]" />}
          <col className="w-20" />
          <col className="w-[15%]" />
          <col className="w-28" />
          <col />
          <col className="w-36" />
          <col className="w-36" />
        </colgroup>
        <thead className="border-b bg-muted/30">
          <tr>
            <th className={th} />
            {showCustomer && <th className={th}>고객사</th>}
            <th className={th}>청구월</th>
            <th className={cn(th, "text-right")}>금액(공급가)</th>
            <th className={th}>상태</th>
            <th className={th}>세금계산서</th>
            <th className={th}>발행일</th>
            <th className={th}>입금일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const amount = finalAmount(r);
            const isOpen = !!open[r.id];
            return (
              <Fragment key={r.id}>
                <tr className={cn("border-b", isOpen && "border-b-0")}>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => setOpen({ ...open, [r.id]: !isOpen })}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                      title="내역 보기"
                    >
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </td>
                  {showCustomer && (
                    <td className={cn(td, "truncate font-medium")}>
                      <Link href={`/customers/${r.customerId}?tab=billing`} className="hover:underline" title={r.customerName}>
                        {r.customerName}
                      </Link>
                    </td>
                  )}
                  <td className={cn(td, "tabular-nums")}>{r.month.replace("-", ".")}</td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    <p className="truncate font-medium">{formatWon(amount)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.adjusted !== null ? "조정됨 · " : ""}VAT {formatWon(withVat(amount))}
                    </p>
                  </td>
                  <td className={td}>
                    <select
                      className={cn(selectClass, "h-7 rounded-full border px-2 text-xs font-medium", STATUS_TONE[r.status])}
                      value={r.status}
                      disabled={busy === r.id}
                      onChange={(e) => save(r, { status: e.target.value as InvoiceStatus }, "상태를 변경했습니다")}
                    >
                      {Object.entries(INVOICE_STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v} className="bg-background text-foreground">
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    {busy === r.id ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : r.taxDoc ? (
                      <span className="flex min-w-0 items-center gap-0.5">
                        <span className="truncate text-xs" title={r.taxDoc.fileName}>
                          {r.taxDoc.fileName}
                        </span>
                        <Button variant="ghost" size="icon-xs" title="다운로드" onClick={() => download(r.taxDoc!.id)}>
                          <Download />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="교체 (기존 파일 삭제)"
                          onClick={() => {
                            target.current = r;
                            fileInput.current?.click();
                          }}
                        >
                          <Replace />
                        </Button>
                        <Button variant="ghost" size="icon-xs" title="삭제" onClick={() => setDeleting(r)}>
                          <Trash2 />
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          target.current = r;
                          fileInput.current?.click();
                        }}
                      >
                        <Upload />
                        업로드
                      </Button>
                    )}
                  </td>
                  <td className={td}>
                    <DatePicker value={r.issuedOn ?? undefined} onChange={(v) => save(r, { issuedOn: v ?? "" }, "발행일을 저장했습니다")} placeholder="-" />
                  </td>
                  <td className={td}>
                    <DatePicker value={r.paidOn ?? undefined} onChange={(v) => save(r, { paidOn: v ?? "" }, "입금일을 저장했습니다")} placeholder="-" />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b bg-muted/20">
                    <td />
                    <td colSpan={showCustomer ? 7 : 6} className="py-3 pr-5">
                      <div className="flex flex-col gap-3">
                        <table className="w-full text-xs">
                          <tbody>
                            {r.lines.map((l, i) => (
                              <tr key={i}>
                                <td className="py-0.5 pr-2 text-muted-foreground">{SOURCE[l.source]}</td>
                                <td className="py-0.5 pr-2 font-medium">{l.name}</td>
                                <td className="py-0.5 pr-2 text-muted-foreground">{l.detail}</td>
                                <td className="py-0.5 pr-2">{CHARGE_TYPE_LABEL[l.type]}</td>
                                <td className="py-0.5 text-right tabular-nums">{formatWon(l.amount)}원</td>
                              </tr>
                            ))}
                            <tr className="border-t">
                              <td colSpan={4} className="pt-1 font-medium">
                                예정 금액 (생성 시점)
                              </td>
                              <td className="pt-1 text-right font-medium tabular-nums">{formatWon(r.planned)}원</td>
                            </tr>
                            {r.adjusted !== null && (
                              <tr>
                                <td colSpan={4} className="text-orange-700">
                                  조정 금액 · {r.adjustReason}
                                </td>
                                <td className="text-right font-medium text-orange-700 tabular-nums">{formatWon(r.adjusted)}원</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setAdjusting(r);
                              setAdjAmount(r.adjusted !== null ? formatWon(r.adjusted) : formatWon(r.planned));
                              setAdjReason(r.adjustReason ?? "");
                              setAdjError(undefined);
                            }}
                          >
                            금액 조정
                          </Button>
                          <Input
                            className="h-7 max-w-md flex-1 text-xs"
                            placeholder="메모"
                            value={memos[r.id] ?? r.memo ?? ""}
                            onChange={(e) => setMemos({ ...memos, [r.id]: e.target.value })}
                          />
                          {(memos[r.id] ?? r.memo ?? "") !== (r.memo ?? "") && (
                            <Button size="xs" onClick={() => save(r, { memo: memos[r.id] }, "메모를 저장했습니다")}>
                              메모 저장
                            </Button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <input
        ref={fileInput}
        type="file"
        hidden
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          upload(f);
        }}
      />

      <Dialog open={!!adjusting} onOpenChange={(o) => !o && !pending && setAdjusting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{adjusting?.month.replace("-", ".")} 청구 금액 조정</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">예정 금액 {formatWon(adjusting?.planned ?? 0)}원</p>
          <Field label="조정 금액 (공급가)">
            <MoneyInput value={adjAmount} onChange={setAdjAmount} />
          </Field>
          <Field label="조정 사유" required={!!adjAmount.trim()}>
            <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
          </Field>
          {adjError && <p className="text-sm text-destructive">{adjError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)} disabled={pending}>
              취소
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await adjustInvoice(adjusting!.id, adjusting!.version, adjAmount, adjReason);
                  if (res.ok) {
                    toast.success("금액을 조정했습니다");
                    setAdjusting(null);
                  } else {
                    setAdjError(res.message);
                    if (res.conflict) router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="세금계산서 삭제"
        description={`${deleting?.taxDoc?.fileName ?? ""}을(를) 삭제합니다. 복구할 수 없습니다. 청구 상태는 바뀌지 않습니다.`}
        confirmLabel="삭제"
        destructive
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteTaxInvoice(deleting!.id);
            setDeleting(null);
            if (res.ok) toast.success("세금계산서를 삭제했습니다");
            else toast.error(res.message);
          })
        }
      />
    </>
  );
}
