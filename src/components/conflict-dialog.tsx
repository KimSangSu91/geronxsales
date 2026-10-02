"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConflictRow = { label: string; latest: string; mine: string };

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전에`;
  const hour = Math.round(min / 60);
  return hour < 24 ? `${hour}시간 전에` : `${Math.round(hour / 24)}일 전에`;
}

// 수정 충돌 모달 (화면정의서 5-9) — 덮어쓰기 버튼 없음
export function ConflictDialog({
  conflict,
  rows,
  onReedit,
  onCancel,
}: {
  conflict: { editorName: string; editedAt: string } | null;
  rows: ConflictRow[];
  onReedit: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={!!conflict} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>다른 사용자가 먼저 수정했습니다</DialogTitle>
          <DialogDescription>
            {conflict && (
              <>
                <b>{conflict.editorName}</b>님이 {ago(conflict.editedAt)} 이 정보를 수정했습니다. 최신 내용을 확인한
                후 다시 저장하세요.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">변경된 항목</th>
                <th className="py-1.5 font-medium">최신값</th>
                <th className="py-1.5 font-medium">내 입력값</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                  <td className="py-1.5 pr-2 font-medium">{r.latest}</td>
                  <td className="py-1.5">{r.mine}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button onClick={onReedit}>최신 내용으로 다시 편집</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
