import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "Đăng ký" };

export default function RegisterPage() {
  return (
    <AuthShell subtitle="Tạo tài khoản mới">
      <RegisterForm />
    </AuthShell>
  );
}
