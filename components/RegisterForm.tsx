"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { Alert, Field } from "./ui";
import { Icon } from "./icons";

export default function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    key: "",
    email: "",
    realName: "",
    nickname: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/register", form);
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สมัครสมาชิกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold text-white">สมัครสมาชิกห้อง SKC105</h1>
      <p className="mt-1.5 text-sm text-slate-400">
        ใช้คีย์ห้องที่ได้รับจากแอดมิน — 1 คีย์ใช้ได้ 1 บัญชีเท่านั้น และจะถูกลบทันทีหลังสมัครสำเร็จ
      </p>

      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="คีย์ห้อง (Room Key)" hint="รูปแบบ SKC105-XXXXXX จากแอดมิน">
          <input
            className="input font-mono tracking-wider uppercase"
            required
            placeholder="SKC105-AB12CD"
            value={form.key}
            onChange={(e) => update("key", e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="อีเมล">
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อจริง">
            <input
              className="input"
              required
              placeholder="สมชาย ใจดี"
              value={form.realName}
              onChange={(e) => update("realName", e.target.value)}
            />
          </Field>
          <Field label="ชื่อเล่น" hint="ใช้แสดงในแชตและประกาศ">
            <input
              className="input"
              required
              maxLength={24}
              placeholder="ชาย"
              value={form.nickname}
              onChange={(e) => update("nickname", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="รหัสผ่าน" hint="อย่างน้อย 8 ตัวอักษร">
            <input
              className="input"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </Field>
          <Field label="ยืนยันรหัสผ่าน">
            <input
              className="input"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
            />
          </Field>
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "กำลังสร้างบัญชี..." : "สมัครสมาชิก"}
          {!busy ? <Icon name="key" className="size-4" /> : null}
        </button>
        <p className="text-center text-[11px] text-slate-500">
          รหัสผ่านถูกเก็บแบบแฮชด้วย scrypt — แอดมินไม่สามารถอ่านรหัสผ่านของคุณได้
        </p>
      </form>

      <p className="mt-8 text-center text-sm text-slate-400">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="font-medium text-indigo-300 hover:text-indigo-200">
          เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  );
}
