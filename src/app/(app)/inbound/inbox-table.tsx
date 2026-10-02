"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { CustomerStatusBadge } from "@/components/customer-status-badge";
import { DatePicker } from "@/components/date-picker";
import { Field, selectClass, textareaClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { InboundChannel } from "@/generated/prisma/enums";
import { todayKst } from "@/lib/date";
import { INBOUND_CHANNEL_LABEL } from "@/lib/labels";
import { createInquiry, dismissInquiry, findDuplicates, restoreInquiry, updateInquiry, type InquiryInput } from "./actions";

export type InquiryRow = {
  id: string;
  channel: InboundChannel;
  sourceName: string | null;
  receivedAt: string;
  receivedOn: string;
  facilityName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  scale: string | null;
  content: string | null;
  dismissReason: string | null;
  handledBy: string | null;
  handledAt: string | null;
};

type Dup = Awaited<ReturnType<typeof findDuplicates>>;

const emptyInput = (): InquiryInput => ({
  channel: "PHONE",
  receivedOn: todayKst(),
  facilityName: "",
  contactName: "",
  phone: "",
  email: "",
  region: "",
  scale: "",
  content: "",
});

const inputOf = (r: InquiryRow): InquiryInput => ({
  channel: r.channel,
  receivedOn: r.receivedOn,
  facilityName: r.facilityName ?? "",
  contactName: r.contactName ?? "",
  phone: r.phone ?? "",
  email: r.email ?? "",
  region: r.region ?? "",
  scale: r.scale ?? "",
  content: r.content ?? "",
});

const pathOf = (r: InquiryRow) => r.sourceName ?? `${INBOUND_CHANNEL_LABEL[r.channel]} (직접 등록)`;
const Dash = () => <span className="text-muted-foreground">-</span>;

export function InboxTable({ rows, tab }: { rows: InquiryRow[]; tab: "NEW" | "DISMISSED" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState<InquiryRow | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; input: InquiryInput } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dismissing, setDismissing] = useState<InquiryRow | null>(null);
  const [reason, setReason] = useState("");
  const [dups, setDups] = useState<{ row: InquiryRow; list: Dup } | null>(null);

  const convert = (r: InquiryRow) =>
    startTransition(async () => {
      const list = await findDuplicates(r.id);
      if (list.length) setDups({ row: r, list });
      else router.push(`/customers/new?inquiry=${r.id}`);
    });

  const saveEdit = () =>
    startTransition(async () => {
      if (!editing) return;
      const r = editing.id ? await updateInquiry(editing.id, editing.input) : await createInquiry(editing.input);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        if (!r.errors) toast.error(r.message);
        return;
      }
      toast.success(editing.id ? "문의를 수정했습니다" : "문의를 등록했습니다");
      setEditing(null);
      setViewing(null);
      setErrors({});
      router.refresh();
    });

  const set = (patch: Partial<InquiryInput>) => setEditing((e) => e && { ...e, input: { ...e.input, ...patch } });

  return (
    <section className="rounded-lg border bg-background">
      <div className="card-head">
        <h2>
          {tab === "NEW" ? "미처리 문의" : "제외한 문의"} <span className="text-sm font-normal text-muted-foreground">{rows.length}건</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setEditing({ id: null, input: emptyInput() })}>
          <Plus />
          문의 등록
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{tab === "NEW" ? "미처리 문의가 없습니다" : "제외한 문의가 없습니다"}</p>
      ) : (
        <table className="data-table w-full table-fixed text-sm">
          <colgroup>
            <col className="w-36" />
            <col className="w-40" />
            <col className="w-[16%]" />
            <col className="w-36" />
            <col className="w-24" />
            <col />
            <col className={tab === "NEW" ? "w-52" : "w-28"} />
          </colgroup>
          <thead>
            <tr className="text-left">
              <th>접수</th>
              <th>경로</th>
              <th>시설명</th>
              <th>담당자</th>
              <th>지역 · 규모</th>
              <th>{tab === "NEW" ? "문의 내용" : "제외 사유"}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setViewing(r)} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
                <td className="text-xs tabular-nums">{r.receivedAt}</td>
                <td className="truncate text-xs" title={pathOf(r)}>
                  {pathOf(r)}
                </td>
                <td className="truncate font-medium" title={r.facilityName ?? undefined}>
                  {r.facilityName ?? <Dash />}
                </td>
                <td>
                  <p className="truncate">{r.contactName ?? <Dash />}</p>
                  {r.phone && <p className="text-xs text-muted-foreground tabular-nums">{r.phone}</p>}
                </td>
                <td>
                  <p className="truncate">{r.region ?? <Dash />}</p>
                  {r.scale && <p className="truncate text-xs text-muted-foreground">{r.scale}</p>}
                </td>
                <td className="truncate text-muted-foreground">{(tab === "NEW" ? r.content : r.dismissReason) ?? "-"}</td>
                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                  {tab === "NEW" ? (
                    <span className="inline-flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setReason("");
                          setDismissing(r);
                        }}
                      >
                        제외
                      </Button>
                      <Button size="sm" className="h-8" disabled={pending} onClick={() => convert(r)}>
                        고객사로 전환
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await restoreInquiry(r.id);
                          if (res.ok) {
                            toast.success("미처리로 되돌렸습니다");
                            router.refresh();
                          } else toast.error(res.message);
                        })
                      }
                    >
                      되돌리기
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 문의 상세 */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.facilityName ?? "문의 상세"}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="flex flex-col gap-4 text-sm">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {(
                  [
                    ["접수", viewing.receivedAt],
                    ["경로", pathOf(viewing)],
                    ["담당자", viewing.contactName],
                    ["연락처", viewing.phone],
                    ["이메일", viewing.email],
                    ["지역", viewing.region],
                    ["규모", viewing.scale],
                    ...(viewing.handledBy ? [["제외", `${viewing.handledBy} · ${viewing.handledAt}`]] : []),
                    ...(viewing.dismissReason ? [["제외 사유", viewing.dismissReason]] : []),
                  ] as [string, string | null][]
                ).map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words">{v ?? "-"}</dd>
                  </div>
                ))}
              </dl>
              <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 px-4 py-3 whitespace-pre-wrap">{viewing.content ?? "내용 없음"}</div>
            </div>
          )}
          {viewing && tab === "NEW" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing({ id: viewing.id, input: inputOf(viewing) })}>
                수정
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setReason("");
                  setDismissing(viewing);
                }}
              >
                제외
              </Button>
              <Button disabled={pending} onClick={() => convert(viewing)}>
                {pending && <Loader2 className="animate-spin" />}
                고객사로 전환
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* 문의 등록·수정 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "문의 수정" : "문의 등록"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="채널" required error={errors.channel}>
                <select className={selectClass} value={editing.input.channel} onChange={(e) => set({ channel: e.target.value as InboundChannel })}>
                  {Object.entries(INBOUND_CHANNEL_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="접수일" required error={errors.receivedOn}>
                <DatePicker value={editing.input.receivedOn} onChange={(v) => set({ receivedOn: v ?? "" })} clearable={false} max={todayKst()} />
              </Field>
              <Field label="시설명" error={errors.facilityName}>
                <Input value={editing.input.facilityName} onChange={(e) => set({ facilityName: e.target.value })} />
              </Field>
              <Field label="담당자">
                <Input value={editing.input.contactName} onChange={(e) => set({ contactName: e.target.value })} />
              </Field>
              <Field label="연락처" error={errors.phone}>
                <Input inputMode="tel" value={editing.input.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="010-0000-0000" />
              </Field>
              <Field label="이메일">
                <Input type="email" value={editing.input.email} onChange={(e) => set({ email: e.target.value })} />
              </Field>
              <Field label="지역">
                <Input value={editing.input.region} onChange={(e) => set({ region: e.target.value })} />
              </Field>
              <Field label="규모">
                <Input value={editing.input.scale} onChange={(e) => set({ scale: e.target.value })} placeholder="예) 정원 50명" />
              </Field>
              <Field label="문의 내용" className="sm:col-span-2">
                <textarea className={textareaClass} rows={5} value={editing.input.content} onChange={(e) => set({ content: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              취소
            </Button>
            <Button onClick={saveEdit} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 제외 */}
      <Dialog open={!!dismissing} onOpenChange={(o) => !o && !pending && setDismissing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>문의 제외</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            <b>{dismissing?.facilityName ?? dismissing?.contactName ?? "이 문의"}</b>를 제외합니다. 제외 탭에서 되돌릴 수 있습니다.
          </p>
          <Field label="제외 사유">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예) 중복 문의, 영업 대상 아님" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissing(null)} disabled={pending}>
              취소
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await dismissInquiry(dismissing!.id, reason);
                  if (!r.ok) return void toast.error(r.message);
                  toast.success("제외했습니다");
                  setDismissing(null);
                  setViewing(null);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              제외
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 중복 의심 확인 */}
      <Dialog open={!!dups} onOpenChange={(o) => !o && setDups(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>중복 의심되는 시설입니다. 전환하시겠습니까?</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-2 text-sm">
            {dups?.list.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.no}. {c.name} <span className="font-normal text-muted-foreground">· {c.region}</span>
                  </p>
                  {c.contacts.length > 0 && <p className="truncate text-xs text-muted-foreground">{c.contacts.join(", ")}</p>}
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <CustomerStatusBadge status={c.status} />
                  <a href={`/customers/${c.id}`} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-4">
                    보기
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDups(null)}>
              취소
            </Button>
            <Button onClick={() => router.push(`/customers/new?inquiry=${dups!.row.id}`)}>그래도 전환</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

