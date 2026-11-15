import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "./LoginForm";

export const metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <AuthShell subtitle="Đăng nhập để tiếp tục">
      <LoginForm />
    </AuthShell>
  );
}
