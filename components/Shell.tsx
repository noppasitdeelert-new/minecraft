"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Avatar, RoleBadge } from "./ui";
import NotificationPrompt from "./NotificationPrompt";
import MusicPlayerProvider from "./MusicPlayerProvider";
import type { Role } from "@/lib/labels";

export type ShellUser = {
  id: number;
  nickname: string;
  real_name: string;
  email: string;
  role: Role;
  avatar_color: string;
};

const NAV = [
  { href: "/home", label: "หน้าแรก", icon: "home" },
  { href: "/chat", label: "แชตห้อง", icon: "chat" },
  { href: "/meeting", label: "ห้องประชุม", icon: "video" },
  { href: "/tasks", label: "การบ้าน", icon: "tasks" },
  { href: "/schedule", label: "ตารางเรียน", icon: "calendar" },
  { href: "/hub", label: "คลังห้อง", icon: "hub" },
  { href: "/music", label: "เพลงห้อง", icon: "music" },
];

const ADMIN_NAV = { href: "/admin", label: "จัดการระบบ", icon: "shield" };

export default function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === "owner" || user.role === "admin";
  const items = isAdmin ? [...NAV, ADMIN_NAV] : NAV;
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <MusicPlayerProvider>
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/8 bg-[#0a1020]/80 px-3 py-5 backdrop-blur-xl lg:flex">
        <Link href="/home" className="mb-6 flex items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white shadow-lg shadow-indigo-900/40">
            SK
          </span>
          <span>
            <span className="block text-sm font-bold tracking-wide text-white">SKC105</span>
            <span className="block text-[11px] text-slate-400">Room Hub</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link ${active(item.href) ? "nav-link-active" : ""}`}>
              <Icon name={item.icon} className="size-[18px]" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.nickname} color={user.avatar_color} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.nickname}</p>
              <p className="truncate text-[11px] text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <RoleBadge role={user.role} />
            <button onClick={logout} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-rose-300" title="ออกจากระบบ">
              <Icon name="logout" className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/8 bg-[#070b16]/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-white/10 p-2 text-slate-300"
            aria-label="เปิดเมนู"
          >
            <Icon name="menu" className="size-4" />
          </button>
          <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-black text-white">
            SK
          </span>
          <span className="text-sm font-semibold text-white">SKC105</span>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={user.role} />
          <Avatar name={user.nickname} color={user.avatar_color} size={30} />
        </div>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-up border-r border-white/10 bg-[#0a1020] p-4">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-black text-white">
                  SK
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{user.nickname}</p>
                  <p className="text-[11px] text-slate-500">{user.real_name}</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400" aria-label="ปิดเมนู">
                <Icon name="close" className="size-4" />
              </button>
            </div>
            <nav className="space-y-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`nav-link ${active(item.href) ? "nav-link-active" : ""}`}
                >
                  <Icon name={item.icon} className="size-[18px]" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <button onClick={logout} className="btn btn-ghost mt-6 w-full">
              <Icon name="logout" className="size-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      ) : null}

      <main className="px-4 pt-6 pb-28 sm:px-6 lg:ml-64 lg:px-8 lg:pb-28">
        <div className="mx-auto w-full max-w-6xl animate-fade-up">
          <NotificationPrompt />
          {children}
        </div>
      </main>
    </div>
    </MusicPlayerProvider>
  );
}
