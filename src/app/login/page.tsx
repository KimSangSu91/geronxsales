import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

const NOTICES: Record<string, string> = {
  inactive: "비활성화된 계정입니다. 관리자에게 문의하세요.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user?.isActive) redirect("/");

  const { error } = await searchParams;
  const notice = typeof error === "string" ? NOTICES[error] : undefined;

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">늘케어 고객관리</CardTitle>
          <CardDescription>발급받은 계정으로 로그인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm notice={notice} />
        </CardContent>
      </Card>
    </main>
  );
}
