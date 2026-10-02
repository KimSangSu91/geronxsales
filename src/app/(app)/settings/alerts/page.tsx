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
        <div>
          <h1 className="text-xl font-semibold">알림 기준</h1>
          <p className="mt-1 text-sm text-muted-foreground">알림이 뜨는 시점을 정합니다. 모든 사용자에게 같은 기준으로 적용됩니다.</p>
        </div>
        <AlertSettingsForm
          key={JSON.stringify(values)}
          items={ALERT_SETTINGS.map((s) => ({ key: s.key, label: s.label, hint: s.hint, fallback: s.fallback, value: values[s.key] }))}
        />
      </div>
    </UnsavedChangesProvider>
  );
}
