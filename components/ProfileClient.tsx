"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import type { Role } from "@/lib/labels";
import { Icon } from "./icons";
import { Alert, Avatar, Field, PageHeader, RoleBadge, SectionCard, Stat } from "./ui";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#64748b"];

type Profile = {
  id: number;
  email: string;
  real_name: string;
  nickname: string;
  role: Role;
  avatar_color: string;
  created_at: string;
  last_login_at: string | null;
};

type Stats = { messages: number; resources: number; votes: number; attendance: number };
type Notice = { tone: "success" | "error"; text: string } | null;

export default function ProfileClient({ profile, stats }: { profile: Profile; stats: Stats }) {
  const router = useRouter();

  const [nickname, setNickname] = useState(profile.nickname);
  const [color, setColor] = useState(profile.avatar_color);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  const dirty = nickname !== profile.nickname || color.toLowerCase() !== profile.avatar_color.toLowerCase();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiPatch("/api/profile", { nickname, avatarColor: color });
      setNotice({ tone: "success", text: "บันทึกโปรไฟล์แล้ว" });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (changingPassword) return;
    setPasswordNotice(null);
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ tone: "error", text: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" });
      return;
    }
    setChangingPassword(true);
    try {
      await apiPatch("/api/profile", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({
        tone: "success",
        text: "เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่นถูกออกจากระบบเพื่อความปลอดภัย",
      });
    } catch (error) {
      setPasswordNotice({ tone: "error", text: error instanceof Error ? error.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="โปรไฟล์ของฉัน"
        description="ข้อมูลสมาชิกในห้อง SKC105 — แก้ชื่อเล่น สีโปรไฟล์ และรหัสผ่านได้เอง"
        icon="user"
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-indigo-500/30 via-violet-500/20 to-sky-500/20" />
            <div className="-mt-9 px-5 pb-5">
              <Avatar name={nickname || profile.nickname} color={color} size={72} className="ring-4 ring-[#0a1020]" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white">{nickname || profile.nickname}</h2>
                <RoleBadge role={profile.role} />
              </div>
              <p className="mt-0.5 text-sm text-slate-400">{profile.real_name}</p>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-2">
                  <dt className="text-slate-500">อีเมล</dt>
                  <dd className="truncate font-medium text-slate-200">{profile.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">สมัครเมื่อ</dt>
                  <dd className="font-medium text-slate-200">{formatDate(profile.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">เข้าใช้ล่าสุด</dt>
                  <dd className="font-medium text-slate-200" title={formatDateTime(profile.last_login_at)}>
                    {relativeTime(profile.last_login_at)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="ข้อความในแชต" value={stats.messages} icon="chat" />
            <Stat label="ชีท/ไฟล์ที่แชร์" value={stats.resources} icon="file" />
            <Stat label="โหวตที่ร่วม" value={stats.votes} icon="chart" />
            <Stat label="เข้าเรียน/มาสาย" value={stats.attendance} icon="calendar" />
          </div>
        </div>

        <div className="space-y-4">
          <SectionCard title="แก้ไขโปรไฟล์" icon="edit">
            <form onSubmit={save} className="space-y-3">
              <Field label="ชื่อเล่นที่แสดงในห้อง" hint="2–24 ตัวอักษร และต้องไม่ซ้ำกับสมาชิกคนอื่น">
                <input
                  className="input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={24}
                  minLength={2}
                  required
                />
              </Field>

              <div>
                <span className="label">สีโปรไฟล์</span>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setColor(option)}
                      aria-label={`เลือกสี ${option}`}
                      aria-pressed={color.toLowerCase() === option}
                      className={`size-9 rounded-full transition ${
                        color.toLowerCase() === option ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a1020]" : "ring-1 ring-white/15"
                      }`}
                      style={{ backgroundColor: option }}
                    />
                  ))}
                </div>
              </div>

              {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

              <div className="flex items-center gap-2">
                <button type="submit" disabled={saving || !dirty} className="btn btn-primary">
                  <Icon name="check" className="size-4" />
                  {saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
                </button>
                {dirty ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setNickname(profile.nickname);
                      setColor(profile.avatar_color);
                      setNotice(null);
                    }}
                  >
                    ยกเลิก
                  </button>
                ) : null}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="ความปลอดภัย" icon="shield">
            <form onSubmit={changePassword} className="space-y-3">
              <Field label="รหัสผ่านปัจจุบัน">
                <input
                  type="password"
                  className="input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร — อุปกรณ์อื่นจะถูกออกจากระบบหลังเปลี่ยน">
                <input
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </Field>
              <Field label="ยืนยันรหัสผ่านใหม่">
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </Field>

              {passwordNotice ? <Alert tone={passwordNotice.tone}>{passwordNotice.text}</Alert> : null}

              <button type="submit" disabled={changingPassword} className="btn btn-ghost w-full">
                <Icon name="key" className="size-4" />
                {changingPassword ? "กำลังเปลี่ยนรหัสผ่าน…" : "เปลี่ยนรหัสผ่าน"}
              </button>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
