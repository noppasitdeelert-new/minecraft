import type { ReactNode } from "react";
import { ROLE_LABEL, ROLE_STYLE } from "@/lib/labels";
import type { Role } from "@/lib/labels";
import { initials } from "@/lib/format";
import { levelProgress } from "@/lib/levels";
import { Icon } from "./icons";

export function Avatar({
  name,
  color,
  imageUrl,
  size = 36,
  className = "",
}: {
  name: string;
  color?: string | null;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ring-2 ring-white/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color || "#6366f1",
        fontSize: Math.max(9, Math.round(size * 0.32)),
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function RoleBadge({ role, className = "" }: { role: Role | string; className?: string }) {
  const key = (role in ROLE_LABEL ? role : "member") as Role;
  return <span className={`badge ${ROLE_STYLE[key]} ${className}`}>{ROLE_LABEL[key]}</span>;
}

export function LevelBadge({ level, className = "" }: { level: number; className?: string }) {
  return <span className={`badge bg-amber-500/15 text-amber-300 ring-amber-400/30 ${className}`}>Lv.{level}</span>;
}

export function TitleBadge({ title, className = "" }: { title?: string | null; className?: string }) {
  if (!title) return null;
  return <span className={`badge bg-violet-500/10 text-violet-200 ring-violet-400/25 ${className}`}>✨ {title}</span>;
}

export function XpBar({ xp, className = "" }: { xp: number; className?: string }) {
  const progress = levelProgress(xp);
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>
          Lv.{progress.level} · {progress.xp} XP
        </span>
        <span>
          {progress.into}/{progress.need} XP สู่ Lv.{progress.level + 1}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

export function Empty({ icon = "hub", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
      <span className="rounded-full bg-white/5 p-3 text-slate-400">
        <Icon name={icon} />
      </span>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="section-title text-base">
          {icon ? (
            <span className="text-indigo-300">
              <Icon name={icon} className="size-[18px]" />
            </span>
          ) : null}
          {title}
        </h2>
        {action}
      </header>
      <div className={`px-5 pb-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-white sm:text-[26px]">
          {icon ? (
            <span className="rounded-xl bg-indigo-500/15 p-2 text-indigo-300 ring-1 ring-inset ring-indigo-400/20">
              <Icon name={icon} />
            </span>
          ) : null}
          {title}
        </h1>
        {description ? <p className="mt-1.5 text-sm text-slate-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}>{children}</div>;
}

export function Stat({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: string; hint?: string }) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        {icon ? (
          <span className="rounded-lg bg-indigo-500/10 p-1.5 text-indigo-300">
            <Icon name={icon} className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}
