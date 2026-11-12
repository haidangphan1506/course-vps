import LoginForm from "./LoginForm";

export const metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className="login-page flex flex-1 items-center justify-center px-5 py-10">
      <div className="login-card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="login-mark grid size-[34px] flex-none place-items-center font-mono text-[13px] font-bold">
            $_
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold leading-tight tracking-tight">Bảng điều khiển dự án</h1>
            <small className="block font-mono text-xs text-[var(--mute)]">Đăng nhập để tiếp tục</small>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
