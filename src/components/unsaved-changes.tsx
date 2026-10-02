"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";

// 편집 중 이탈 확인 (화면정의서 5-7): 편집 중인 영역이 있으면
// 화면 안 링크 클릭(탭·메뉴 등)과 브라우저 닫기·새로고침 때 확인
type Ctx = { setDirty: (key: string, dirty: boolean) => void };

const UnsavedContext = createContext<Ctx>({ setDirty: () => {} });

export function useUnsavedChanges(key: string, dirty: boolean) {
  const { setDirty } = useContext(UnsavedContext);
  useEffect(() => {
    setDirty(key, dirty);
    return () => setDirty(key, false);
  }, [key, dirty, setDirty]);
}

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const hasDirty = dirtyKeys.length > 0;

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((keys) => {
      const has = keys.includes(key);
      if (dirty === has) return keys;
      return dirty ? [...keys, key] : keys.filter((k) => k !== key);
    });
  }, []);

  useEffect(() => {
    if (!hasDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // 캡처 단계에서 링크 클릭을 먼저 가로챔 (Next Link 포함)
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [hasDirty]);

  return (
    <UnsavedContext.Provider value={{ setDirty }}>
      {children}
      <ConfirmDialog
        open={!!pendingHref}
        onOpenChange={(open) => !open && setPendingHref(null)}
        title="저장하지 않은 변경사항이 있습니다"
        description="이동하면 편집 중인 내용이 사라집니다."
        confirmLabel="이동"
        cancelLabel="계속 편집"
        destructive
        onConfirm={() => {
          const href = pendingHref!;
          setDirtyKeys([]);
          setPendingHref(null);
          router.push(href);
        }}
      />
    </UnsavedContext.Provider>
  );
}
