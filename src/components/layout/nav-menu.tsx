"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  FileInput,
  Building2,
  Cpu,
  Inbox,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  adminOnly?: boolean;
};

type NavSection = { title?: string; items: NavItem[] };

// 기능정의서 3장 화면 구성(IA)
const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "대시보드", icon: LayoutDashboard },
      { href: "/customers", label: "고객사", icon: Building2 },
      { href: "/billing", label: "청구 관리", icon: ReceiptText },
      { href: "/inbound", label: "인바운드 문의함", icon: Inbox },
      { href: "/devices", label: "장비관리 (2차)", icon: Cpu, disabled: true },
    ],
  },
  {
    title: "설정",
    items: [
      { href: "/settings/alerts", label: "알림 기준", icon: BellRing },
      { href: "/settings/inbound", label: "문의 수신 경로", icon: FileInput, adminOnly: true },
      { href: "/settings/users", label: "사용자 관리", icon: Users, adminOnly: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavMenu({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4 p-3">
      {SECTIONS.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.title && (
            <p className="flex items-center gap-1.5 px-2.5 pb-1 text-xs font-medium text-muted-foreground">
              <Settings className="size-3.5" />
              {section.title}
            </p>
          )}
          {section.items
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const Icon = item.icon;
              const base = "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm";
              if (item.disabled) {
                return (
                  <span key={item.href} className={cn(base, "cursor-not-allowed text-muted-foreground/60")}>
                    <Icon className="size-4" />
                    {item.label}
                  </span>
                );
              }
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    base,
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
