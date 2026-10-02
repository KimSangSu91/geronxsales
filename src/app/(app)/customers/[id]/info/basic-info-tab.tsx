import { fromDbDate } from "@/lib/date";
import type { CustomerDetail } from "../detail-data";
import { AccountsSection, type AccountRow } from "./accounts-section";
import { ContactsSection, type ContactRow } from "./contacts-section";
import { SectionCard } from "./section-card";
import { customerValues, pickSection, type SectionKey } from "./sections";

// 기본정보 탭: 섹션 카드 7개 (화면정의서 4-1)
export function BasicInfoTab({
  detail,
  owners,
  editSection,
}: {
  detail: CustomerDetail;
  owners: { id: string; name: string; isActive: boolean }[];
  editSection?: SectionKey;
}) {
  const c = detail.customer;
  const values = customerValues(c);

  const contacts: ContactRow[] = c.contacts.map((x) => ({
    id: x.id,
    isPrimary: x.isPrimary,
    version: x.version,
    name: x.name,
    phone: x.phone ?? "",
    role: x.role ?? "",
    title: x.title ?? "",
    email: x.email ?? "",
    memo: x.memo ?? "",
  }));

  const accounts: AccountRow[] = c.accounts.map((a) => ({
    id: a.id,
    isPrimary: a.isPrimary,
    version: a.version,
    hasPassword: !!a.passwordEnc,
    loginId: a.loginId,
    type: a.type,
    typeOther: a.typeOther ?? "",
    userName: a.userName ?? "",
    issuedOn: a.issuedOn ? fromDbDate(a.issuedOn) : "",
    status: a.status,
    deactivatedOn: a.deactivatedOn ? fromDbDate(a.deactivatedOn) : "",
    password: "",
    passwordClear: false,
    memo: a.memo ?? "",
  }));

  const card = (section: SectionKey) => (
    <SectionCard
      // 다른 사람 저장 등으로 값·version이 바뀌면 카드를 새로 그림
      key={`${section}-${c.version}-${editSection === section}`}
      customerId={c.id}
      section={section}
      values={pickSection(section, values)}
      version={c.version}
      owners={owners}
      hasWifiPassword={!!c.wifiPasswordEnc}
      defaultEditing={editSection === section}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {card("basic")}
      <ContactsSection customerId={c.id} contacts={contacts} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {card("biz")}
        {card("billing")}
      </div>
      {card("install")}
      {card("service")}
      <AccountsSection
        customerId={c.id}
        accounts={accounts}
        contactNames={contacts.map((x) => x.name)}
      />
    </div>
  );
}
