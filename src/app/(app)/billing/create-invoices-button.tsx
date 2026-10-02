"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createMissingInvoices } from "./invoice-actions";

// 이번 달 청구 건 수동 생성 — 자동 생성(매일 배치·화면 열 때)이 안 됐을 때 사용, 이미 있으면 건너뜀
export function CreateInvoicesButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      title="사용중 고객사 중 이번 달 청구 건이 없는 곳만 만듭니다"
      onClick={() =>
        startTransition(async () => {
          const r = await createMissingInvoices();
          toast.success(r.created.length ? `${r.created.length}건 만들었습니다: ${r.created.join(", ")}` : "새로 만들 청구 건이 없습니다");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      청구 건 수동 생성
    </Button>
  );
}
