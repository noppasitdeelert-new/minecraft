/** XP, level and title rules — shared by server pages and client components. */

export type TitleOption = { id: string; label: string; minLevel: number };

/** Titles unlocked by level. Admins can also hand out custom titles. */
export const TITLE_CATALOG: TitleOption[] = [
  { id: "newcomer", label: "น้องใหม่ SKC105", minLevel: 1 },
  { id: "regular", label: "ขาประจำห้อง", minLevel: 3 },
  { id: "helper", label: "ผู้ช่วยเพื่อน", minLevel: 5 },
  { id: "scholar", label: "นักวิชาการห้อง", minLevel: 8 },
  { id: "veteran", label: "รุ่นพี่ตัวจริง", minLevel: 12 },
  { id: "legend", label: "ตำนาน SKC105", minLevel: 20 },
];

/** Total XP needed to reach a level: L2 = 100, L3 = 300, L4 = 600, L5 = 1000 … */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.trunc(level));
  return 50 * l * (l - 1);
}

export function levelFromXp(xp: number | null | undefined): number {
  const value = Math.max(0, Math.trunc(Number(xp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= value) level += 1;
  return level;
}

export function levelProgress(xp: number | null | undefined) {
  const value = Math.max(0, Math.trunc(Number(xp) || 0));
  const level = levelFromXp(value);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = value - base;
  const need = next - base;
  return {
    xp: value,
    level,
    into,
    need,
    remaining: Math.max(0, next - value),
    nextLevelAt: next,
    percent: need > 0 ? Math.min(100, Math.round((into / need) * 100)) : 100,
  };
}

/** Every title the member may equip right now (level unlocks + admin grants). */
export function availableTitles(level: number, granted: string[] = []): string[] {
  const unlocked = TITLE_CATALOG.filter((t) => t.minLevel <= level).map((t) => t.label);
  const extra = granted.map((t) => t.trim()).filter(Boolean);
  return Array.from(new Set([...unlocked, ...extra]));
}

export function defaultTitle(level: number): string {
  const unlocked = TITLE_CATALOG.filter((t) => t.minLevel <= level);
  return unlocked.length ? unlocked[unlocked.length - 1].label : TITLE_CATALOG[0].label;
}
