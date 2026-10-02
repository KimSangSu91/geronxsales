import { UnsavedChangesProvider } from "@/components/unsaved-changes";
import { requireUser } from "@/lib/auth";
import { ALERT_SETTINGS, getAlertSettings } from "@/lib/settings";
import { AlertSettingsForm } from "./alert-settings-form";

// 설정 > 알림 기준 (기능정의서 4-10)
export default async function AlertSettingsPage() {
  await requireUser();
  const values = await getAlertSettings();
  return (
    <UnsavedChangesProvider>
      <div className="flex flex-col gap-5">
        <h1 className="text-xl font-semibold">알림 기준</h1>
        <AlertSettingsForm
          key={JSON.stringify(values)}
          items={ALERT_SETTINGS.map((s) => ({ key: s.key, label: s.label, hint: s.hint, fallback: s.fallback, value: values[s.key] }))}
        />
      </div>
    </UnsavedChangesProvider>
  );
}
