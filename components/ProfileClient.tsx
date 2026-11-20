"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client";
import { fileToDataUrl } from "@/lib/image";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { availableTitles } from "@/lib/levels";
import { ROLE_LABEL, XP_REASON_LABEL } from "@/lib/labels";
import type { Role } from "@/lib/labels";
import { Icon } from "./icons";
import { Alert, Avatar, Field, LevelBadge, PageHeader, RoleBadge, SectionCard, Stat, TitleBadge, XpBar } from "./ui";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#64748b"];
const TITLE_NONE = "";

type Profile = {
  id: number;
  email: string;
  real_name: string;
  nickname: string;
  role: Role;
  avatar_color: string;
  avatar_url: string | null;
  xp: number;
  bio: string | null;
  title: string | null;
  created_at: string;
  last_login_at: string | null;
};

type Stats = { messages: number; resources: number; votes: number; attendance: number };
type XpEntry = { amount: number; reason: string; created_at: string };
type Notice = { tone: "success" | "error"; text: string } | null;

export default function ProfileClient({
  profile,
  level,
  grantedTitles,
  rank,
  recentXp,
  stats,
}: {
  profile: Profile;
  level: number;
  grantedTitles: string[];
  rank: number;
  recentXp: XpEntry[];
  stats: Stats;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [nickname, setNickname] = useState(profile.nickname);
  const [color, setColor] = useState(profile.avatar_color);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [title, setTitle] = useState(profile.title ?? TITLE_NONE);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  const titles = availableTitles(level, grantedTitles);

  const dirty =
    nickname !== profile.nickname ||
    color.toLowerCase() !== profile.avatar_color.toLowerCase() ||
    avatarUrl !== (profile.avatar_url ?? "") ||
    bio.trim() !== (profile.bio ?? "") ||
    title !== (profile.title ?? "");

  function reset() {
    setNickname(profile.nickname);
    setColor(profile.avatar_color);
    setAvatarUrl(profile.avatar_url ?? "");
    setBio(profile.bio ?? "");
    setTitle(profile.title ?? TITLE_NONE);
    setNotice(null);
  }

  async function pickAvatar(file: File | null) {
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const dataUrl = await fileToDataUrl(file, 320, 0.85);
      setAvatarUrl(dataUrl);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ" });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {};
      if (nickname !== profile.nickname) payload.nickname = nickname;
      if (color.toLowerCase() !== profile.avatar_color.toLowerCase()) payload.avatarColor = color;
      if (avatarUrl !== (profile.avatar_url ?? "")) payload.avatarUrl = avatarUrl;
      if (bio.trim() !== (profile.bio ?? "")) payload.bio = bio.trim();
      if (title !== (profile.title ?? "")) payload.title = title;

      await apiPatch("/api/profile", payload);
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
        description="ข้อมูลสมาชิกในห้อง SKC105 — รูปโปรไฟล์ คำคม ฉายา แต้ม XP และรหัสผ่าน"
        icon="user"
      />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-indigo-500/30 via-violet-500/20 to-sky-500/20" />
            <div className="-mt-9 px-5 pb-5">
              <Avatar
                name={nickname || profile.nickname}
                color={color}
                imageUrl={avatarUrl || null}
                size={72}
                className="ring-4 ring-[#0a1020]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white">{nickname || profile.nickname}</h2>
                <RoleBadge role={profile.role} />
                <LevelBadge level={level} />
                <TitleBadge title={title || null} />
              </div>
              <p className="mt-0.5 text-sm text-slate-400">{profile.real_name}</p>
              <p className="text-[11px] text-slate-500">
                {ROLE_LABEL[profile.role]} · อันดับ {rank} ของห้อง
              </p>
              {bio.trim() ? <p className="mt-2 text-sm text-slate-300 italic">“{bio.trim()}”</p> : null}

              <XpBar xp={profile.xp} className="mt-4" />

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
            <Stat label="แต้ม XP" value={profile.xp} icon="spark" hint={`เลเวล ${level}`} />
            <Stat label="อันดับในห้อง" value={`#${rank}`} icon="trophy" hint="เรียงตามแต้ม XP" />
            <Stat label="ข้อความในแชต" value={stats.messages} icon="chat" />
            <Stat label="ชีท/ไฟล์ที่แชร์" value={stats.resources} icon="file" />
            <Stat label="โหวตที่ร่วม" value={stats.votes} icon="chart" />
            <Stat label="เข้าเรียน/มาสาย" value={stats.attendance} icon="calendar" />
          </div>

          <SectionCard title="ประวัติแต้ม XP ล่าสุด" icon="chart">
            {recentXp.length === 0 ? (
              <p className="text-sm text-slate-500">ยังไม่มีประวัติแต้ม — เช็กชื่อ ทำการบ้าน หรือแชร์ชีทเพื่อเริ่มสะสม</p>
            ) : (
              <ul className="space-y-2">
                {recentXp.map((entry, index) => (
                  <li
                    key={`${entry.created_at}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">
                        {XP_REASON_LABEL[entry.reason] ?? XP_REASON_LABEL[entry.reason.split(":")[0]] ?? entry.reason}
                      </p>
                      <p className="text-[11px] text-slate-500">{relativeTime(entry.created_at)}</p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-sm font-semibold ${
                        entry.amount >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {entry.amount >= 0 ? "+" : ""}
                      {entry.amount} XP
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="แก้ไขโปรไฟล์" icon="edit">
            <form onSubmit={save} className="space-y-3">
              <div>
                <span className="label">รูปโปรไฟล์</span>
                <div className="flex items-center gap-3">
                  <Avatar name={nickname || profile.nickname} color={color} imageUrl={avatarUrl || null} size={56} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="btn btn-ghost btn-sm"
                      disabled={uploading}
                    >
                      <Icon name="camera" className="size-4" />
                      {uploading ? "กำลังย่อรูป…" : "เลือกรูป"}
                    </button>
                    {avatarUrl ? (
                      <button type="button" onClick={() => setAvatarUrl("")} className="btn btn-ghost btn-sm">
                        <Icon name="trash" className="size-4" /> ลบรูป
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void pickAvatar(e.target.files?.[0] ?? null)}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">รูปจะถูกย่อเหลือ 320px ก่อนบันทึก (ไม่เกิน ~300 KB)</p>
              </div>

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

              <Field label="คำคม / สถานะสั้น ๆ" hint="ไม่เกิน 140 ตัวอักษร — แสดงใต้ชื่อในโปรไฟล์">
                <input
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={140}
                  placeholder="เช่น ขยันให้สุดแล้วหยุดพัก"
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

              <div>
                <span className="label">ฉายาที่สวมใส่</span>
                <select className="input" value={title} onChange={(e) => setTitle(e.target.value)}>
                  <option value={TITLE_NONE}>— ไม่ใช้ฉายา —</option>
                  {titles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">ปลดล็อกฉายาเพิ่มได้จากเลเวลที่สูงขึ้น หรือรับจากแอดมิน</p>
              </div>

              {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

              <div className="flex items-center gap-2">
                <button type="submit" disabled={saving || !dirty} className="btn btn-primary">
                  <Icon name="check" className="size-4" />
                  {saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
                </button>
                {dirty ? (
                  <button type="button" className="btn btn-ghost" onClick={reset}>
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
