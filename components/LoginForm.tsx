"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { Alert, Field } from "./ui";
import { Icon } from "./icons";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiPost("/api/auth/login", { email, password });
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-8 lg:hidden">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white">
          SK
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white">เข้าสู่ระบบ SKC105</h1>
      <p className="mt-1.5 text-sm text-slate-400">กรอกอีเมลและรหัสผ่านที่ใช้สมัครสมาชิกกับห้อง</p>

      <div className="mt-5 space-y-3">{error ? <Alert tone="error">{error}</Alert> : null}</div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="อีเมล">
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="รหัสผ่าน">
          <div className="relative">
            <input
              className="input pr-20"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              {showPassword ? "ซ่อน" : "แสดง"}
            </button>
          </div>
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          {!busy ? <Icon name="logout" className="size-4 rotate-180" /> : null}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-400">
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" className="font-medium text-indigo-300 hover:text-indigo-200">
          สมัครด้วยคีย์ห้อง
        </Link>
      </p>
    </div>
  );
}
