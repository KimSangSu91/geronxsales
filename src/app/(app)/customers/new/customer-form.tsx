"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass, textareaClass } from "@/components/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CODE_RE,
  emptyContact,
  validateCustomerInput,
  type ContactInput,
  type CustomerInput,
  type FieldErrors,
} from "@/lib/customer-input";
import {
  CONTACT_ROLE_LABEL,
  FACILITY_TYPE_LABEL,
  INBOUND_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { checkCodeAvailable, createCustomer } from "../actions";

type Owner = { id: string; name: string };

const initialInput = (ownerId: string): CustomerInput => ({
  name: "",
  code: "",
  facilityType: "",
  facilityTypeOther: "",
  region: "",
  address: "",
  capacity: "",
  ownerId,
  inboundChannel: "",
  referrer: "",
  memo: "",
  contacts: [emptyContact(true)],
  bizName: "",
  bizNo: "",
  bizCeo: "",
  billingDay: "",
  paymentMethod: "",
  taxInvoice: "",
  taxInvoiceEmail: "",
  floors: "",
  rooms: "",
  wifiSsid: "",
  wifiPassword: "",
  networkMemo: "",
  serviceUrl: "",
});

// 섹션별 필드 (오류가 있는 접힌 섹션을 자동으로 펼치기 위함)
const SECTION_FIELDS: Record<string, string[]> = {
  biz: ["bizName", "bizNo", "bizCeo"],
  billing: ["billingDay", "paymentMethod", "taxInvoice", "taxInvoiceEmail"],
  install: ["floors", "rooms", "wifiSsid", "wifiPassword", "networkMemo"],
  service: ["serviceUrl"],
};

function Section({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left disabled:cursor-default"
      >
        <span>
          <span className="font-semibold">{title}</span>
          {description && <span className="ml-2 text-xs text-muted-foreground">{description}</span>}
        </span>
        {onToggle && <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />}
      </button>
      {open && <div className="border-t px-5 py-5">{children}</div>}
    </section>
  );
}

type CodeState = "idle" | "checking" | "available" | "taken" | "invalid";

export function CustomerForm({
  owners,
  defaultOwnerId,
  preset,
  inquiryId,
}: {
  owners: Owner[];
  defaultOwnerId: string;
  preset?: Partial<CustomerInput>; // 인바운드 문의에서 전환할 때 미리 채울 값
  inquiryId?: string;
}) {
  const router = useRouter();
  const start = () => ({ ...initialInput(defaultOwnerId), ...preset });
  const [input, setInput] = useState<CustomerInput>(start);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // 중복 확인 결과는 어떤 코드에 대한 결과인지 함께 보관 → 표시 상태는 계산
  const [codeCheck, setCodeCheck] = useState<{ code: string; ok: boolean } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);

  const [initialJson] = useState(() => JSON.stringify(start()));
  const dirty = JSON.stringify(input) !== initialJson;

  const trimmedCode = input.code.trim();
  const codeState: CodeState = !trimmedCode
    ? "idle"
    : !CODE_RE.test(trimmedCode)
      ? "invalid"
      : codeCheck?.code !== trimmedCode
        ? "checking"
        : codeCheck.ok
          ? "available"
          : "taken";

  // 브라우저 닫기·새로고침 시 이탈 경고
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!saving.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // 고객사 코드 중복 확인 (입력 멈춘 뒤 0.4초)
  useEffect(() => {
    const code = trimmedCode;
    if (!code || !CODE_RE.test(code)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ok = await checkCodeAvailable(code);
      if (!cancelled) setCodeCheck({ code, ok });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedCode]);

  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => {
    const next = { ...input, [key]: value };
    setInput(next);
    if (submitted) setErrors(validateCustomerInput(next));
  };

  const setContact = (index: number, patch: Partial<ContactInput>) => {
    const contacts = input.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c));
    set("contacts", contacts);
  };

  const removeContact = (index: number) => {
    const contacts = input.contacts.filter((_, i) => i !== index);
    set("contacts", contacts.length ? contacts : [emptyContact(true)]);
  };

  const isOpen = (key: string) => !!open[key];
  const toggle = (key: string) => setOpen({ ...open, [key]: !open[key] });

  const submit = () => {
    setSubmitted(true);
    const found = validateCustomerInput(input);
    if (codeState === "taken") found.code = "이미 사용 중인 코드입니다.";
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage("필수 항목과 입력 형식을 확인하세요.");
      // 오류가 있는 접힌 섹션 펼치기
      const reopen = { ...open };
      for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
        if (fields.some((f) => found[f])) reopen[section] = true;
      }
      setOpen(reopen);
      return;
    }
    setMessage(undefined);
    saving.current = true;
    startTransition(async () => {
      const result = await createCustomer(input, inquiryId);
      // 성공하면 서버에서 상세 화면으로 이동하므로 여기에는 실패만 돌아옴
      saving.current = false;
      if (result) {
        setErrors(result.errors);
        setMessage(result.message);
      }
    });
  };

  const cancel = () => (dirty ? setConfirmLeave(true) : router.push("/customers"));

  const codeHint: Record<CodeState, React.ReactNode> = {
    idle: null,
    checking: (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> 확인 중…
      </span>
    ),
    available: (
      <span className="flex items-center gap-1 text-xs text-emerald-700">
        <Check className="size-3" /> 사용 가능 · 저장 후에는 변경할 수 없습니다
      </span>
    ),
    taken: (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <X className="size-3" /> 이미 사용 중인 코드입니다
      </span>
    ),
    invalid: <span className="text-xs text-destructive">영문 소문자와 숫자만 사용할 수 있습니다</span>,
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      {/* 기본 */}
      <Section title="기본" open>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="시설명" required error={errors.name}>
            <Input value={input.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <Field label="고객사 코드" error={errors.code} hint={codeHint[codeState]}>
            <Input
              value={input.code}
              onChange={(e) => set("code", e.target.value.toLowerCase())}
              placeholder="예) hbnh"
              aria-invalid={!!errors.code || codeState === "taken" || codeState === "invalid"}
            />
          </Field>
          <Field label="시설 유형" required error={errors.facilityType ?? errors.facilityTypeOther}>
            <div className="flex gap-2">
              <select
                className={selectClass}
                value={input.facilityType}
                onChange={(e) => set("facilityType", e.target.value as CustomerInput["facilityType"])}
                aria-invalid={!!errors.facilityType}
              >
                <option value="">선택</option>
                {Object.entries(FACILITY_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label === "기타" ? "기타(직접입력)" : label}
                  </option>
                ))}
              </select>
              {input.facilityType === "OTHER" && (
                <Input
                  value={input.facilityTypeOther}
                  onChange={(e) => set("facilityTypeOther", e.target.value)}
                  placeholder="직접입력"
                  aria-invalid={!!errors.facilityTypeOther}
                />
              )}
            </div>
          </Field>
          <Field label="지역" required error={errors.region}>
            <Input
              value={input.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder="예) 남양주"
              aria-invalid={!!errors.region}
            />
          </Field>
          <Field label="주소" className="md:col-span-2">
            <Input value={input.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="정원" error={errors.capacity}>
            <Input
              inputMode="numeric"
              value={input.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              placeholder="명"
              aria-invalid={!!errors.capacity}
            />
          </Field>
          <Field label="내부 담당자" required error={errors.ownerId}>
            <select
              className={selectClass}
              value={input.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
              aria-invalid={!!errors.ownerId}
            >
              <option value="">선택</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="유입 채널" error={errors.inboundChannel}>
            <div className="flex gap-2">
              <select
                className={selectClass}
                value={input.inboundChannel}
                onChange={(e) => set("inboundChannel", e.target.value as CustomerInput["inboundChannel"])}
              >
                <option value="">선택</option>
                {Object.entries(INBOUND_CHANNEL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {(input.inboundChannel === "REFERRAL" || input.inboundChannel === "GOOGLE_FORM") && (
                <Input
                  value={input.referrer}
                  onChange={(e) => set("referrer", e.target.value)}
                  placeholder={input.inboundChannel === "REFERRAL" ? "소개처" : "수신 경로"}
                />
              )}
            </div>
          </Field>
          <Field label="메모" className="md:col-span-2">
            <textarea
              value={input.memo}
              onChange={(e) => set("memo", e.target.value)}
              rows={3}
              className={textareaClass}
            />
          </Field>
        </div>
      </Section>

      {/* 시설 담당자 */}
      <Section title="시설 담당자" open>
        <div className="flex flex-col gap-3">
          {errors.contacts && <p className="text-sm text-destructive">{errors.contacts}</p>}
          {input.contacts.map((c, i) => (
            <div key={i} className="rounded-md border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm" title="실무·주 소통 담당자 (여러 명 지정 가능)">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={c.isPrimary}
                    onChange={(e) => setContact(i, { isPrimary: e.target.checked })}
                  />
                  대표 담당자
                </label>
                {input.contacts.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(i)}>
                    <Trash2 />
                    삭제
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="이름" required error={errors[`contacts.${i}.name`]}>
                  <Input
                    value={c.name}
                    onChange={(e) => setContact(i, { name: e.target.value })}
                    aria-invalid={!!errors[`contacts.${i}.name`]}
                  />
                </Field>
                <Field label="연락처" required error={errors[`contacts.${i}.phone`]}>
                  <Input
                    inputMode="tel"
                    value={c.phone}
                    onChange={(e) => setContact(i, { phone: e.target.value })}
                    placeholder="010-0000-0000"
                    aria-invalid={!!errors[`contacts.${i}.phone`]}
                  />
                </Field>
                <Field label="역할">
                  <select
                    className={selectClass}
                    value={c.role}
                    onChange={(e) => setContact(i, { role: e.target.value as ContactInput["role"] })}
                  >
                    <option value="">선택</option>
                    {Object.entries(CONTACT_ROLE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="직책">
                  <Input
                    value={c.title}
                    onChange={(e) => setContact(i, { title: e.target.value })}
                    placeholder="예) 간호팀장"
                  />
                </Field>
                <Field label="이메일" error={errors[`contacts.${i}.email`]}>
                  <Input
                    type="email"
                    value={c.email}
                    onChange={(e) => setContact(i, { email: e.target.value })}
                    aria-invalid={!!errors[`contacts.${i}.email`]}
                  />
                </Field>
                <Field label="메모">
                  <Input value={c.memo} onChange={(e) => setContact(i, { memo: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => set("contacts", [...input.contacts, emptyContact()])}
          >
            <Plus />
            담당자 추가
          </Button>
        </div>
      </Section>

      {/* 사업자 정보 */}
      <Section title="사업자 정보" description="선택" open={isOpen("biz")} onToggle={() => toggle("biz")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="운영 법인명">
            <Input value={input.bizName} onChange={(e) => set("bizName", e.target.value)} />
          </Field>
          <Field label="사업자등록번호">
            <Input
              inputMode="numeric"
              value={input.bizNo}
              onChange={(e) => set("bizNo", e.target.value)}
              placeholder="000-00-00000"
            />
          </Field>
          <Field label="대표자명">
            <Input value={input.bizCeo} onChange={(e) => set("bizCeo", e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* 정산 정보 */}
      <Section title="정산 정보" description="선택" open={isOpen("billing")} onToggle={() => toggle("billing")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="청구일 (매월)" error={errors.billingDay}>
            <Input
              inputMode="numeric"
              value={input.billingDay}
              onChange={(e) => set("billingDay", e.target.value)}
              placeholder="1~31"
              aria-invalid={!!errors.billingDay}
            />
          </Field>
          <Field label="결제 수단" error={errors.paymentMethod}>
            <select
              className={selectClass}
              value={input.paymentMethod}
              onChange={(e) => set("paymentMethod", e.target.value as CustomerInput["paymentMethod"])}
            >
              <option value="">선택</option>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="세금계산서 발행" error={errors.taxInvoice}>
            <select
              className={selectClass}
              value={input.taxInvoice}
              onChange={(e) => set("taxInvoice", e.target.value as CustomerInput["taxInvoice"])}
            >
              <option value="">선택</option>
              <option value="yes">발행</option>
              <option value="no">미발행</option>
            </select>
          </Field>
          <Field label="발행 이메일" error={errors.taxInvoiceEmail}>
            <Input
              type="email"
              value={input.taxInvoiceEmail}
              onChange={(e) => set("taxInvoiceEmail", e.target.value)}
              aria-invalid={!!errors.taxInvoiceEmail}
            />
          </Field>
        </div>
      </Section>

      {/* 설치 환경 */}
      <Section title="설치 환경" description="선택" open={isOpen("install")} onToggle={() => toggle("install")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="층수" error={errors.floors}>
            <Input
              inputMode="numeric"
              value={input.floors}
              onChange={(e) => set("floors", e.target.value)}
              aria-invalid={!!errors.floors}
            />
          </Field>
          <Field label="생활실(호실) 수" error={errors.rooms}>
            <Input
              inputMode="numeric"
              value={input.rooms}
              onChange={(e) => set("rooms", e.target.value)}
              aria-invalid={!!errors.rooms}
            />
          </Field>
          <Field label="와이파이 이름(SSID)">
            <Input value={input.wifiSsid} onChange={(e) => set("wifiSsid", e.target.value)} />
          </Field>
          <Field
            label="와이파이 비밀번호"
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={input.wifiPassword}
              onChange={(e) => set("wifiPassword", e.target.value)}
            />
          </Field>
          <Field label="네트워크 메모" className="md:col-span-2">
            <Input value={input.networkMemo} onChange={(e) => set("networkMemo", e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* 서비스 운영 */}
      <Section
        title="서비스 운영"
        description="선택"
        open={isOpen("service")}
        onToggle={() => toggle("service")}
      >
        <Field label="서비스 페이지 URL" error={errors.serviceUrl}>
          <Input
            type="url"
            value={input.serviceUrl}
            onChange={(e) => set("serviceUrl", e.target.value)}
            placeholder="https://"
            aria-invalid={!!errors.serviceUrl}
          />
        </Field>
      </Section>

      {/* 하단 버튼 */}
      <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-3 border-t bg-background/95 px-6 py-3 backdrop-blur">
        {message && <p className="mr-auto text-sm text-destructive">{message}</p>}
        <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>등록을 취소할까요?</DialogTitle>
            <DialogDescription>작성 중인 내용이 저장되지 않고 사라집니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>
              계속 작성
            </Button>
            <Button variant="destructive" onClick={() => router.push("/customers")}>
              나가기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
