"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/login/actions";

// 상단 헤더 우측 내 계정 → [마이페이지] [로그아웃] (화면정의서 9장)
export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted">
        {name}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/mypage")}>
          <UserRound />
          마이페이지
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending} onClick={() => startTransition(() => logout())}>
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
