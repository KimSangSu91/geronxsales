"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createMissingInvoices } from "./invoice-actions";

// 이번 달 청구 건 만들기 — 매일 배치와 같은 처리(이미 있으면 건너뜀). 배포 전이나 배치가 돌지 않았을 때 사용
export function CreateInvoicesButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      title="사용중 고객사 중 이번 달 청구 건이 없는 곳만 만듭니다 (매일 자동으로도 실행)"
      onClick={() =>
        startTransition(async () => {
          const r = await createMissingInvoices();
          toast.success(r.created.length ? `${r.created.length}건 만들었습니다: ${r.created.join(", ")}` : "새로 만들 청구 건이 없습니다");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      이번 달 청구 건 만들기
    </Button>
  );
}
