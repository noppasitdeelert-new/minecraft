"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/client";
import { formatDateShort, formatDateTime, relativeTime } from "@/lib/format";
import { ROLE_LABEL, ROLE_STYLE, STATUS_LABEL, STATUS_STYLE } from "@/lib/labels";
import { levelFromXp } from "@/lib/levels";
import type { Role } from "@/lib/labels";
import type { AdminMember, ApiKeyItem, AuditLog, InviteKey, MusicSong, WebhookItem } from "@/lib/types";
import { Alert, Avatar, Empty, LevelBadge, RoleBadge } from "./ui";
import MemberXpEditor from "./admin/MemberXpEditor";
import { Icon } from "./icons";

const TABS = [
  { key: "keys", label: "คีย์ห้อง", icon: "key" },
  { key: "members", label: "สมาชิกและยศ", icon: "users" },
  { key: "settings", label: "การแจ้งเตือน", icon: "bell" },
  { key: "keylink", label: "ลิงก์คีย์", icon: "link" },
  { key: "integrations", label: "API & Webhook", icon: "webhook" },
  { key: "music", label: "เพลง", icon: "music" },
  { key: "audit", label: "Audit Logs", icon: "shield" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type SongSearchResult = {
  source: "audius" | "archive";
  sourceKey: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  audioUrl: string | null;
  license: string | null;
};

type IntegrationsPayload = {
  webhooks: WebhookItem[];
  keys: ApiKeyItem[];
  limits: { webhooks: number; apiKeys: number };
  counts: { webhooks: number; apiKeys: number };
};

export default function AdminClient({ me }: { me: { id: number; role: Role; nickname: string } }) {
  const [tab, setTab] = useState<TabKey>("keys");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // keys
  const [keys, setKeys] = useState<InviteKey[]>([]);
  const [keyStats, setKeyStats] = useState({ available: 0, used: 0 });
  const [newNote, setNewNote] = useState("");
  const [newCount, setNewCount] = useState(1);
  const [lastCodes, setLastCodes] = useState<string[]>([]);

  // members
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [search, setSearch] = useState("");

  // settings
  const [settings, setSettings] = useState<{
    discord: string;
    line: string;
    envDiscord: boolean;
    envLine: boolean;
    jitsi: string;
    appUrl: string;
  } | null>(null);

  // key link helper
  const [keylink, setKeylink] = useState<{
    enabled: boolean;
    dailyLimit: number;
    extraDomains: string[];
    defaults: { dailyLimit: number; maxLimit: number; maxDomains: number };
    stats: { today: number; total: number; users: number; unlocked: number };
    pool: { available: number; unassigned: number };
    recent: Array<{ id: number; nickname: string; host: string; status: string; kind: string; created_at: string }>;
  } | null>(null);
  const [keylinkDomains, setKeylinkDomains] = useState("");

  // audit
  const [logs, setLogs] = useState<AuditLog[]>([]);

  // integrations (api keys + webhooks)
  const [integrations, setIntegrations] = useState<IntegrationsPayload | null>(null);
  const [hookForm, setHookForm] = useState({ name: "", kind: "discord", url: "", secret: "" });
  const [keyName, setKeyName] = useState("");
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // music library
  const [musicSongs, setMusicSongs] = useState<MusicSong[]>([]);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicSource, setMusicSource] = useState("all");
  const [musicResults, setMusicResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState({ title: "", artist: "", durationMs: 0 });
  const [uploading, setUploading] = useState(false);
  const [importForm, setImportForm] = useState({ url: "", title: "", artist: "" });

  const loadKeys = useCallback(async () => {
    const res = await apiGet<{ keys: InviteKey[]; stats: { available: number; used: number } }>("/api/admin/keys");
    setKeys(res.keys);
    setKeyStats(res.stats);
  }, []);

  const loadMembers = useCallback(async () => {
    const res = await apiGet<{ members: AdminMember[] }>("/api/admin/users");
    setMembers(res.members);
  }, []);

  const loadSettings = useCallback(async () => {
    setSettings(await apiGet("/api/admin/settings"));
  }, []);

  const loadKeyLink = useCallback(async () => {
    const res = await apiGet<{
      enabled: boolean;
      dailyLimit: number;
      extraDomains: string[];
      defaults: { dailyLimit: number; maxLimit: number; maxDomains: number };
      stats: { today: number; total: number; users: number; unlocked: number };
      pool: { available: number; unassigned: number };
      recent: Array<{ id: number; nickname: string; host: string; status: string; kind: string; created_at: string }>;
    }>("/api/admin/key-link");
    setKeylink(res);
    setKeylinkDomains(res.extraDomains.join(", "));
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await apiGet<{ logs: AuditLog[] }>("/api/admin/audit?limit=200");
    setLogs(res.logs);
  }, []);

  const loadIntegrations = useCallback(async () => {
    setIntegrations(await apiGet<IntegrationsPayload>("/api/admin/integrations"));
  }, []);

  const loadMusic = useCallback(async () => {
    const res = await apiGet<{ songs: MusicSong[] }>("/api/admin/music");
    setMusicSongs(res.songs);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        if (tab === "keys") await loadKeys();
        if (tab === "members") await loadMembers();
        if (tab === "settings") await loadSettings();
        if (tab === "keylink") await loadKeyLink();
        if (tab === "integrations") await loadIntegrations();
        if (tab === "music") await loadMusic();
        if (tab === "audit") await loadLogs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      }
    })();
  }, [tab, loadKeys, loadMembers, loadSettings, loadKeyLink, loadLogs, loadIntegrations, loadMusic]);

  async function generateKeys(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<{ codes: string[] }>("/api/admin/keys", { note: newNote, count: newCount });
      setLastCodes(res.codes);
      setNewNote("");
      setNewCount(1);
      await loadKeys();
      setNotice(`สร้างคีย์ใหม่ ${res.codes.length} คีย์ — ใช้ได้คีย์ละ 1 บัญชี และจะถูกลบเมื่อสมัครสำเร็จ`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างคีย์ไม่สำเร็จ");
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`คัดลอก ${code} แล้ว`);
    } catch {
      setError("เบราว์เซอร์ไม่อนุญาตให้คัดลอก กรุณาคัดลอกด้วยตนเอง");
    }
  }

  async function deleteKey(id: number) {
    if (!confirm("ลบคีย์นี้?")) return;
    try {
      await apiDelete(`/api/admin/keys?id=${id}`);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบคีย์ไม่สำเร็จ");
    }
  }

  async function pushKey() {
    try {
      const res = await apiPatch<{ codes: string[]; sent: number }>("/api/admin/keys");
      setLastCodes(res.codes);
      await loadKeys();
      setNotice(`ส่งคีย์ที่ยังไม่ถูกใช้ทั้งหมด ${res.sent} คีย์เข้า Discord / LINE แล้ว (ถ้าตั้งค่า webhook ไว้)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคีย์ไม่สำเร็จ");
    }
  }

  async function updateMember(member: AdminMember, payload: { role?: string; status?: string; xpDelta?: number; title?: string }) {
    setError(null);
    try {
      await apiPatch("/api/admin/users", { id: member.id, ...payload });
      await loadMembers();
      setNotice(`อัปเดตข้อมูลของ ${member.nickname} แล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ");
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError(null);
    try {
      await apiPut("/api/admin/settings", { discord: settings.discord, line: settings.line });
      setNotice("บันทึกการตั้งค่า Webhook แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function saveKeyLink(event: React.FormEvent) {
    event.preventDefault();
    if (!keylink) return;
    setError(null);
    try {
      await apiPut("/api/admin/key-link", {
        enabled: keylink.enabled,
        dailyLimit: keylink.dailyLimit,
        domains: keylinkDomains,
      });
      await loadKeyLink();
      setNotice("บันทึกการตั้งค่าตัวช่วยลิงก์คีย์แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    }
  }

  async function testWebhook() {
    try {
      const res = await apiPost<{ message: string }>("/api/admin/settings", { action: "test" });
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทดสอบไม่สำเร็จ");
    }
  }

  /* ── API keys & webhooks ── */

  async function createApiKey(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<{ key: string }>("/api/admin/integrations", { target: "api_key", name: keyName });
      setNewApiKey(res.key);
      setKeyName("");
      await loadIntegrations();
      setNotice("สร้าง API Key แล้ว — คัดลอกตอนนี้เท่านั้น ระบบไม่แสดงคีย์เต็มอีก");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง API Key ไม่สำเร็จ");
    }
  }

  async function createWebhook(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/admin/integrations", { target: "webhook", ...hookForm });
      setHookForm({ name: "", kind: "discord", url: "", secret: "" });
      await loadIntegrations();
      setNotice("เพิ่ม Webhook แล้ว — ระบบจะส่งการแจ้งเตือนไปทุกช่องที่เปิดใช้งาน");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่ม Webhook ไม่สำเร็จ");
    }
  }

  async function toggleIntegration(target: "webhook" | "api_key", id: number, enabled: boolean) {
    setError(null);
    try {
      await apiPatch("/api/admin/integrations", { target, id, enabled });
      await loadIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ");
    }
  }

  async function removeIntegration(target: "webhook" | "api_key", id: number) {
    if (!confirm(target === "api_key" ? "เพิกถอน API Key นี้?" : "ลบ Webhook นี้?")) return;
    setError(null);
    try {
      await apiDelete(`/api/admin/integrations?target=${target}&id=${id}`);
      await loadIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function testAllWebhooks() {
    setError(null);
    try {
      const res = await apiPut<{ message: string }>("/api/admin/integrations", {});
      setNotice(res.message);
      await loadIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทดสอบไม่สำเร็จ");
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`คัดลอก${label}แล้ว`);
    } catch {
      setError("เบราว์เซอร์ไม่อนุญาตให้คัดลอก กรุณาคัดลอกด้วยตนเอง");
    }
  }

  /* ── Music ── */

  async function searchMusic(event?: React.FormEvent) {
    event?.preventDefault();
    if (!musicQuery.trim()) return;
    setSearching(true);
    setError(null);
    setPreviewId(null);
    setPreviewSrc(null);
    try {
      const res = await apiGet<{ results: SongSearchResult[] }>(
        `/api/admin/music/search?q=${encodeURIComponent(musicQuery)}&source=${musicSource}`,
      );
      setMusicResults(res.results);
      if (res.results.length === 0) setNotice("ไม่พบเพลงที่ค้นหา — ลองพิมพ์ชื่อเพลง/ศิลปินเป็นภาษาใดก็ได้ หรือสลับแหล่งเพลง");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ค้นหาเพลงไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  }

  async function togglePreview(track: SongSearchResult) {
    setError(null);
    if (previewId === track.sourceKey) {
      setPreviewId(null);
      setPreviewSrc(null);
      return;
    }
    if (track.audioUrl) {
      setPreviewId(track.sourceKey);
      setPreviewSrc(track.audioUrl);
      return;
    }
    setPreviewBusy(track.sourceKey);
    try {
      const resolved = await apiGet<{ audioUrl: string }>(
        `/api/admin/music/resolve?identifier=${encodeURIComponent(track.sourceKey)}`,
      );
      setPreviewId(track.sourceKey);
      setPreviewSrc(resolved.audioUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปิดตัวอย่างเพลงไม่สำเร็จ");
    } finally {
      setPreviewBusy(null);
    }
  }

  async function downloadTrack(track: SongSearchResult) {
    setDownloadingId(track.sourceKey);
    setError(null);
    try {
      const payload =
        track.source === "audius"
          ? {
              source: "audius",
              sourceKey: track.sourceKey,
              title: track.title,
              artist: track.artist,
              album: track.album,
              artworkUrl: track.artworkUrl,
              durationMs: track.durationMs,
              enqueue: true,
            }
          : {
              source: "archive",
              identifier: track.sourceKey,
              title: track.title,
              artist: track.artist,
              artworkUrl: track.artworkUrl,
              enqueue: true,
            };
      const res = await apiPost<{ created: boolean; song: MusicSong }>("/api/admin/music", payload);
      setNotice(
        res.created
          ? `ดาวน์โหลดเพลงเต็ม “${track.title}” เข้าเว็บแล้ว และเพิ่มเข้าคิวให้ทุกคนฟัง`
          : `เพลง “${track.title}” มีอยู่ในคลังแล้ว — เพิ่มเข้าคิวให้เรียบร้อย`,
      );
      await loadMusic();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดาวน์โหลดเพลงไม่สำเร็จ");
    } finally {
      setDownloadingId(null);
    }
  }

  function pickUpload(file: File | null) {
    setUploadFile(file);
    setUploadMeta((prev) => ({
      ...prev,
      title: prev.title || (file ? file.name.replace(/\.[^.]+$/, "") : ""),
      durationMs: 0,
    }));
    if (!file) return;
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.src = url;
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration)) {
        setUploadMeta((prev) => ({ ...prev, durationMs: Math.round(probe.duration * 1000) }));
      }
      URL.revokeObjectURL(url);
    };
    probe.onerror = () => URL.revokeObjectURL(url);
  }

  async function uploadSong(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("title", uploadMeta.title || uploadFile.name);
      form.set("artist", uploadMeta.artist || "ไม่ทราบศิลปิน");
      form.set("durationMs", String(uploadMeta.durationMs || 0));
      const res = await fetch("/api/admin/music/upload", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; song?: MusicSong };
      if (!res.ok) throw new Error(data.error || `อัปโหลดไม่สำเร็จ (${res.status})`);
      setNotice(`อัปโหลด “${data.song?.title ?? "เพลง"}” เข้าเว็บแล้ว และเพิ่มเข้าคิวให้ทุกคนฟัง`);
      setUploadFile(null);
      setUploadMeta({ title: "", artist: "", durationMs: 0 });
      await loadMusic();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดเพลงไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function importFromUrl(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await apiPost<{ created: boolean; song: MusicSong }>("/api/admin/music", {
        source: "url",
        url: importForm.url,
        title: importForm.title,
        artist: importForm.artist,
        enqueue: true,
      });
      setNotice(
        res.created
          ? `นำเข้าเพลงเต็ม “${res.song.title}” เข้าเว็บแล้ว และเพิ่มเข้าคิวให้ทุกคนฟัง`
          : `เพลงนี้มีอยู่ในคลังแล้ว — เพิ่มเข้าคิวให้เรียบร้อย`,
      );
      setImportForm({ url: "", title: "", artist: "" });
      await loadMusic();
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าเพลงไม่สำเร็จ");
    }
  }

  async function removeSong(song: MusicSong) {
    if (!confirm(`ลบ “${song.title}” ออกจากคลังเพลง?`)) return;
    setError(null);
    try {
      await apiDelete(`/api/admin/music?id=${song.id}`);
      await loadMusic();
      setNotice("ลบเพลงแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบเพลงไม่สำเร็จ");
    }
  }

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => `${m.nickname} ${m.real_name} ${m.email}`.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-1 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              tab === t.key ? "bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-400/30" : "text-slate-400 hover:bg-white/5"
            }`}
          >
            <Icon name={t.icon} className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {/* ─── Keys ─── */}
      {tab === "keys" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs text-slate-400">คีย์ที่ยังไม่ถูกใช้</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{keyStats.available}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400">สมัครด้วยคีย์แล้ว (คน)</p>
              <p className="mt-1 text-2xl font-bold text-slate-300">{keyStats.used}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400">รูปแบบคีย์</p>
              <p className="mt-1 font-mono text-sm font-semibold text-indigo-300">SKC105-XXXXXX</p>
            </div>
          </div>

          <form onSubmit={generateKeys} className="card space-y-2.5 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="label">หมายเหตุ (เช่น สำหรับเพื่อนกลุ่ม A)</span>
                <input className="input" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="ไม่บังคับ" />
              </label>
              <label>
                <span className="label">จำนวน</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input w-24"
                  value={newCount}
                  onChange={(e) => setNewCount(Number(e.target.value))}
                />
              </label>
              <button className="btn btn-primary">
                <Icon name="key" className="size-4" /> สร้างคีย์เชิญ
              </button>
              <button type="button" onClick={pushKey} className="btn btn-ghost">
                <Icon name="bell" className="size-4" /> ส่งคีย์ที่ยังไม่ถูกใช้ทั้งหมด
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              ปุ่มส่งจะส่งคีย์ที่ยังไม่ถูกใช้ทั้งหมดพร้อมกัน — ทุกคีย์ใช้สมัครได้เพียง 1 บัญชี และถูกลบออกจากฐานข้อมูลทันทีเมื่อสมัครสำเร็จ
              <br />
              ระบบเติมคีย์อัตโนมัติ: ทุก ๆ 5 คนที่ใช้คีย์สมัครแล้ว ระบบจะสร้างคีย์ชุดใหม่ 5 คีย์และส่งเข้า Discord/LINE ให้เอง
            </p>
          </form>

          {lastCodes.length > 0 ? (
            <div className="card border-emerald-400/25 bg-emerald-500/[0.06] p-4">
              <p className="mb-2 text-xs font-medium text-emerald-200">คีย์ที่เพิ่งสร้าง — ส่งให้สมาชิกใหม่</p>
              <div className="flex flex-wrap gap-2">
                {lastCodes.map((code) => (
                  <button key={code} onClick={() => copy(code)} className="rounded-lg bg-slate-950/60 px-3 py-1.5 font-mono text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-slate-950">
                    {code}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">คีย์</th>
                    <th className="px-4 py-2.5 font-medium">หมายเหตุ</th>
                    <th className="px-4 py-2.5 font-medium">ผู้สร้าง</th>
                    <th className="px-4 py-2.5 font-medium">สถานะ</th>
                    <th className="px-4 py-2.5 font-medium">สร้างเมื่อ</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keys.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        ยังไม่มีคีย์ — กดสร้างคีย์เชิญด้านบน
                      </td>
                    </tr>
                  ) : null}
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-mono text-slate-200">{k.code}</td>
                      <td className="px-4 py-2.5 text-slate-400">{k.note ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-400">{k.creator_nickname ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {k.used_at ? (
                          <span className="badge bg-slate-500/15 text-slate-400 ring-slate-400/30">ใช้แล้ว{k.used_by_nickname ? ` · ${k.used_by_nickname}` : ""}</span>
                        ) : (
                          <span className="badge bg-emerald-500/15 text-emerald-300 ring-emerald-400/30">พร้อมใช้</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDateTime(k.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => copy(k.code)} className="rounded p-1 text-slate-500 hover:text-indigo-300" title="คัดลอก">
                          <Icon name="file" className="size-3.5" />
                        </button>
                        <button onClick={() => deleteKey(k.id)} className="rounded p-1 text-slate-500 hover:text-rose-300" title="ลบคีย์">
                          <Icon name="trash" className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Members ─── */}
      {tab === "members" ? (
        <div className="space-y-3">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">
              <Icon name="search" className="size-4" />
            </span>
            <input className="input pl-9" placeholder="ค้นหาชื่อเล่น ชื่อจริง หรืออีเมล" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">สมาชิก</th>
                    <th className="px-4 py-2.5 font-medium">ชื่อจริง</th>
                    <th className="px-4 py-2.5 font-medium">อีเมล</th>
                    <th className="px-4 py-2.5 font-medium">ยศ / บทบาท</th>
                    <th className="px-4 py-2.5 font-medium">แต้ม XP / ฉายา</th>
                    <th className="px-4 py-2.5 font-medium">สถานะ</th>
                    <th className="px-4 py-2.5 font-medium">เข้าใช้ล่าสุด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredMembers.map((m) => {
                    const locked = m.role === "owner" || m.id === me.id;
                    return (
                      <tr key={m.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={m.nickname} color={m.avatar_color} imageUrl={m.avatar_url} size={26} />
                            <div>
                              <p className="flex items-center gap-1 font-medium text-slate-100">
                                {m.nickname}
                                <LevelBadge level={levelFromXp(m.xp)} className="!px-1 !py-0 !text-[9px]" />
                              </p>
                              <p className="text-[10px] text-slate-500">{m.message_count} ข้อความ</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{m.real_name}</td>
                        <td className="px-4 py-2.5 text-slate-400">{m.email}</td>
                        <td className="px-4 py-2.5">
                          {locked ? (
                            <RoleBadge role={m.role} />
                          ) : (
                            <select
                              className={`rounded-lg border-0 px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${ROLE_STYLE[m.role]} bg-transparent`}
                              value={m.role}
                              onChange={(e) => updateMember(m, { role: e.target.value })}
                            >
                              {(["member", "moderator", "admin"] as Role[])
                                .filter((r) => me.role === "owner" || r !== "admin")
                                .map((r) => (
                                  <option key={r} value={r} className="bg-slate-900 text-slate-100">
                                    {ROLE_LABEL[r]}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <MemberXpEditor member={m} onSave={(payload) => updateMember(m, payload)} />
                        </td>
                        <td className="px-4 py-2.5">
                          {m.role === "owner" || m.id === me.id ? (
                            <span className={`badge ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                          ) : (
                            <button
                              onClick={() => updateMember(m, { status: m.status === "active" ? "suspended" : "active" })}
                              className={`badge cursor-pointer ${STATUS_STYLE[m.status]}`}
                              title="คลิกเพื่อสลับสถานะ"
                            >
                              {STATUS_LABEL[m.status]}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {m.last_login_at ? relativeTime(m.last_login_at) : "ยังไม่เคยเข้า"}
                          <span className="block text-[10px] text-slate-600">สมัคร {formatDateShort(m.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredMembers.length === 0 ? <Empty icon="users" title="ไม่พบสมาชิกที่ค้นหา" /> : null}
          </div>
          <p className="text-[11px] text-slate-500">
            บัญชีแอดมินสูงสุดแก้ไขไม่ได้ · การระงับบัญชีจะตัด session ทั้งหมดทันที · เฉพาะแอดมินสูงสุดที่ตั้งยศ “แอดมิน” ได้
            · ปรับแต้ม XP บวก/ลบได้ครั้งละไม่เกิน 10,000 และมอบฉายาให้สมาชิกได้
          </p>
        </div>
      ) : null}

      {/* ─── Key link helper ─── */}
      {tab === "keylink" && keylink ? (
        <div className="space-y-3">
          <form onSubmit={saveKeyLink} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="link" className="size-4 text-indigo-300" /> ตัวช่วยลิงก์คีย์ (Key Link Helper)
            </h3>

            <label className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <input
                type="checkbox"
                checked={keylink.enabled}
                onChange={(e) => setKeylink({ ...keylink, enabled: e.target.checked })}
                className="mt-0.5 size-4 accent-indigo-500"
              />
              <span>
                <span className="block text-sm text-slate-100">เปิดให้สมาชิกใช้งาน</span>
                <span className="block text-[11px] text-slate-500">
                  ปิดแล้วทุกคนจะตรวจ/ปลดล็อกลิงก์ไม่ได้ทันที แต่ประวัติและคีย์ที่เคยได้ยังอยู่ครบ
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">โควตาต่อคนต่อวัน (1–{keylink.defaults.maxLimit})</span>
                <input
                  type="number"
                  min={1}
                  max={keylink.defaults.maxLimit}
                  value={keylink.dailyLimit}
                  onChange={(e) => setKeylink({ ...keylink, dailyLimit: Number(e.target.value) })}
                  className="input"
                />
              </label>
              <label>
                <span className="label">โดเมนที่อนุญาตเพิ่มเติม (คั่นด้วย ,)</span>
                <input
                  value={keylinkDomains}
                  onChange={(e) => setKeylinkDomains(e.target.value)}
                  className="input font-mono text-xs"
                  placeholder="example.com, keys.example.org"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              โดเมนของเว็บนี้ถูกอนุญาตอยู่แล้ว · ลิงก์ภายนอกตรวจสอบได้แต่ระบบจะไม่ออกรหัสคีย์ · สูงสุด{" "}
              {keylink.defaults.maxDomains} โดเมน
            </p>

            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm">บันทึกการตั้งค่า</button>
              <button type="button" onClick={() => void loadKeyLink()} className="btn btn-ghost btn-sm">
                รีโหลด
              </button>
            </div>
          </form>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs text-slate-400">ปลดล็อกวันนี้</p>
              <p className="mt-1 text-2xl font-bold text-indigo-300">{keylink.stats.today}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400">ปลดล็อกทั้งหมด</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{keylink.stats.unlocked}</p>
              <p className="mt-1 text-[11px] text-slate-500">จากทั้งหมด {keylink.stats.total} รายการ · {keylink.stats.users} คน</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400">คีย์ว่างในคลัง</p>
              <p className="mt-1 text-2xl font-bold text-amber-300">{keylink.pool.available}</p>
              <p className="mt-1 text-[11px] text-slate-500">ยังไม่ถูกจ่ายผ่านตัวช่วย {keylink.pool.unassigned} ใบ</p>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-white">รายการล่าสุด</h3>
            {keylink.recent.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">ยังไม่มีการใช้งานตัวช่วยลิงก์คีย์</p>
            ) : (
              <ul className="mt-2 divide-y divide-white/5 text-xs">
                {keylink.recent.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-slate-200">{row.nickname}</span>
                    <span className="font-mono text-[10px] text-slate-500">{row.host}</span>
                    <span
                      className={`badge ${
                        row.status === "unlocked"
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                          : "bg-sky-500/15 text-sky-300 ring-sky-400/30"
                      }`}
                    >
                      {row.status === "unlocked" ? "ปลดล็อก" : "ตรวจสอบ"}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">{relativeTime(row.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              ทุกครั้งถูกบันทึกใน Audit Logs (keylink.unlock / keylink.validate / keylink.settings) · ไม่มีการเก็บรหัสคีย์เต็มในบันทึก
            </p>
          </div>
        </div>
      ) : null}

      {/* ─── Settings ─── */}
      {tab === "settings" && settings ? (
        <div className="space-y-3">
          <form onSubmit={saveSettings} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="bell" className="size-4 text-indigo-300" /> Webhook แจ้งเตือนอัตโนมัติ
            </h3>
            <label className="block">
              <span className="label">Discord Webhook URL</span>
              <input
                className="input font-mono text-xs"
                placeholder="https://discord.com/api/webhooks/..."
                value={settings.discord}
                onChange={(e) => setSettings({ ...settings, discord: e.target.value })}
              />
              {settings.envDiscord ? <span className="mt-1 block text-[11px] text-emerald-300">ตรวจพบ DISCORD_WEBHOOK_URL ใน env</span> : null}
            </label>
            <label className="block">
              <span className="label">LINE Webhook / Notify URL</span>
              <input
                className="input font-mono text-xs"
                placeholder="https://notify-api.line.me/api/notify หรือ LINE Messaging webhook"
                value={settings.line}
                onChange={(e) => setSettings({ ...settings, line: e.target.value })}
              />
              {settings.envLine ? <span className="mt-1 block text-[11px] text-emerald-300">ตรวจพบ LINE_WEBHOOK_URL ใน env</span> : null}
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm">บันทึก</button>
              <button type="button" onClick={testWebhook} className="btn btn-ghost btn-sm">
                ส่งข้อความทดสอบ
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              ระบบจะแจ้งเตือนเมื่อมีประกาศสำคัญ งานใหม่ โพลใหม่ ห้องประชุมใหม่ และสมาชิกใหม่เข้าห้อง
            </p>
          </form>

          <div className="card space-y-2 p-4 text-xs text-slate-400">
            <h3 className="text-sm font-semibold text-white">สถานะระบบ</h3>
            <p>
              การเข้าสู่ระบบ: <span className="text-emerald-300">อีเมล + รหัสผ่าน (แฮช scrypt)</span>
            </p>
            <p>โดเมนห้องประชุม (Jitsi): <span className="font-mono text-slate-300">{settings.jitsi}</span></p>
            <p>APP_URL: <span className="font-mono text-slate-300">{settings.appUrl}</span></p>
          </div>
        </div>
      ) : null}

      {/* ─── API keys & webhooks ─── */}
      {tab === "integrations" && integrations ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <p className="text-xs text-slate-400">Webhook ที่ใช้อยู่</p>
              <p className="mt-1 text-2xl font-bold text-indigo-300">
                {integrations.counts.webhooks}
                <span className="text-sm font-normal text-slate-500"> / {integrations.limits.webhooks}</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Discord, LINE หรือ endpoint ของตัวเอง</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400">API Key ที่ใช้งานได้</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">
                {integrations.counts.apiKeys}
                <span className="text-sm font-normal text-slate-500"> / {integrations.limits.apiKeys}</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">ใช้เรียก POST /api/hooks/notify</p>
            </div>
          </div>

          <form onSubmit={createApiKey} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="key" className="size-4 text-indigo-300" /> สร้าง API Key สำหรับ LINE / บอต / สคริปต์
            </h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1">
                <span className="label">ชื่อคีย์ (เช่น LINE แจ้งเตือนห้อง)</span>
                <input className="input" required value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="LINE Notify ห้อง SKC105" />
              </label>
              <button className="btn btn-primary">
                <Icon name="plus" className="size-4" /> สร้าง API Key
              </button>
            </div>
            {newApiKey ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3">
                <p className="text-[11px] font-medium text-emerald-200">คัดลอกคีย์นี้เก็บไว้ — จะแสดงเพียงครั้งเดียว</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-950/60 px-2.5 py-1.5 font-mono text-xs text-emerald-200">{newApiKey}</code>
                  <button type="button" onClick={() => copyText(newApiKey, " API Key ")} className="btn btn-ghost btn-sm">คัดลอก</button>
                </div>
              </div>
            ) : null}
            <p className="text-[11px] text-slate-500">
              ใช้งาน: <code className="text-slate-300">POST /api/hooks/notify</code> พร้อม header{" "}
              <code className="text-slate-300">Authorization: Bearer &lt;key&gt;</code> และ body{" "}
              <code className="text-slate-300">{`{ "message": "..." }`}</code> — ข้อความจะถูกส่งไปทุก Webhook ที่เปิดใช้งาน
            </p>

            {integrations.keys.length > 0 ? (
              <ul className="divide-y divide-white/5 rounded-xl border border-white/8">
                {integrations.keys.map((key) => (
                  <li key={key.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-200">{key.name}</span>
                      <span className="font-mono text-[10px] text-slate-500">{key.prefix}••••••••</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {key.revoked_at ? "เพิกถอนแล้ว" : key.last_used_at ? `ใช้ล่าสุด ${relativeTime(key.last_used_at)}` : "ยังไม่ถูกใช้"}
                    </span>
                    {!key.revoked_at ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleIntegration("api_key", key.id, key.enabled !== 1)}
                          className="badge bg-white/5 text-slate-300 ring-white/10"
                        >
                          {key.enabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        </button>
                        <button type="button" onClick={() => removeIntegration("api_key", key.id)} className="rounded p-1 text-slate-500 hover:text-rose-300" title="เพิกถอน">
                          <Icon name="trash" className="size-3.5" />
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </form>

          <form onSubmit={createWebhook} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="webhook" className="size-4 text-indigo-300" /> เพิ่ม Webhook แจ้งเตือน
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">ชื่อ</span>
                <input className="input" required value={hookForm.name} onChange={(e) => setHookForm({ ...hookForm, name: e.target.value })} placeholder="Discord ห้อง SKC105" />
              </label>
              <label>
                <span className="label">ประเภท</span>
                <select className="input" value={hookForm.kind} onChange={(e) => setHookForm({ ...hookForm, kind: e.target.value })}>
                  <option value="discord" className="bg-slate-900">Discord</option>
                  <option value="line" className="bg-slate-900">LINE Notify</option>
                  <option value="custom" className="bg-slate-900">อื่น ๆ (JSON)</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="label">Webhook URL</span>
              <input className="input font-mono text-xs" required value={hookForm.url} onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })} placeholder="https://discord.com/api/webhooks/..." />
            </label>
            <label className="block">
              <span className="label">Token (สำหรับ LINE Notify — ไม่บังคับ)</span>
              <input className="input font-mono text-xs" type="password" value={hookForm.secret} onChange={(e) => setHookForm({ ...hookForm, secret: e.target.value })} placeholder="วาง token ที่นี่" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm">เพิ่ม Webhook</button>
              <button type="button" onClick={testAllWebhooks} className="btn btn-ghost btn-sm">
                ส่งข้อความทดสอบทั้งหมด
              </button>
            </div>
            <p className="text-[11px] text-slate-500">เพิ่มได้สูงสุด {integrations.limits.webhooks} รายการ</p>
          </form>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">ชื่อ</th>
                    <th className="px-4 py-2.5 font-medium">ประเภท</th>
                    <th className="px-4 py-2.5 font-medium">ปลายทาง</th>
                    <th className="px-4 py-2.5 font-medium">สถานะล่าสุด</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {integrations.webhooks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">ยังไม่มี Webhook</td>
                    </tr>
                  ) : null}
                  {integrations.webhooks.map((hook) => (
                    <tr key={hook.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-slate-200">{hook.name}</td>
                      <td className="px-4 py-2.5 text-slate-400 uppercase">{hook.kind}</td>
                      <td className="max-w-56 truncate px-4 py-2.5 font-mono text-[10px] text-slate-500">{hook.url}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {hook.last_sent_at ? `${hook.last_status ?? "—"} · ${relativeTime(hook.last_sent_at)}` : "ยังไม่เคยส่ง"}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => toggleIntegration("webhook", hook.id, hook.enabled !== 1)}
                          className={`badge ${hook.enabled ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" : "bg-slate-500/15 text-slate-400 ring-slate-400/30"}`}
                        >
                          {hook.enabled ? "เปิด" : "ปิด"}
                        </button>
                        <button onClick={() => removeIntegration("webhook", hook.id)} className="ml-1 rounded p-1 text-slate-500 hover:text-rose-300" title="ลบ">
                          <Icon name="trash" className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Music ─── */}
      {tab === "music" ? (
        <div className="space-y-4">
          <form onSubmit={uploadSong} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="download" className="size-4 text-indigo-300" /> ดาวน์โหลดเพลงเต็มจากเครื่องของคุณเข้าเว็บ
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">ไฟล์เสียง (mp3 / m4a / ogg / wav / flac · สูงสุด 60 MB)</span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac,.opus,.webm"
                  onChange={(e) => pickUpload(e.target.files?.[0] ?? null)}
                  className="input file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-1.5 file:text-xs file:text-indigo-200"
                />
              </label>
              <label>
                <span className="label">ชื่อเพลง</span>
                <input className="input" value={uploadMeta.title} onChange={(e) => setUploadMeta({ ...uploadMeta, title: e.target.value })} placeholder="ชื่อเพลง (ภาษาใดก็ได้)" />
              </label>
              <label>
                <span className="label">ศิลปิน</span>
                <input className="input" value={uploadMeta.artist} onChange={(e) => setUploadMeta({ ...uploadMeta, artist: e.target.value })} placeholder="ชื่อศิลปิน" />
              </label>
              <div className="flex items-end">
                <button className="btn btn-primary w-full" disabled={!uploadFile || uploading}>
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดเข้าคิว"}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              ใช้ไฟล์ที่คุณมีสิทธิ์ — ไฟล์จะถูกเก็บในเว็บและเล่นเต็มเพลงให้ทุกคนฟังตามคิว (ความยาวจริงถูกอ่านอัตโนมัติ)
            </p>
          </form>

          <form onSubmit={searchMusic} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="search" className="size-4 text-indigo-300" /> ค้นหาเพลงเต็มจากคลังเพลงอิสระ (รองรับทุกภาษา)
            </h3>
            <div className="flex flex-wrap gap-2">
              <select className="input w-44" value={musicSource} onChange={(e) => setMusicSource(e.target.value)}>
                <option value="all" className="bg-slate-900">ทุกแหล่ง</option>
                <option value="audius" className="bg-slate-900">Audius (เพลงเต็ม)</option>
                <option value="archive" className="bg-slate-900">Internet Archive</option>
              </select>
              <input
                className="input min-w-48 flex-1"
                value={musicQuery}
                onChange={(e) => setMusicQuery(e.target.value)}
                placeholder="ชื่อเพลง หรือศิลปิน — ไทย อังกฤษ ญี่ปุ่น เกาหลี ฯลฯ"
              />
              <button className="btn btn-primary" disabled={searching || !musicQuery.trim()}>
                {searching ? "กำลังค้นหา..." : "ค้นหาเพลง"}
                {!searching ? <Icon name="search" className="size-4" /> : null}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              ผลลัพธ์เป็นเพลงเต็ม (ไม่ใช่คลิป 30 วิ) — ฟังก่อนได้ แล้วกด “ดาวน์โหลดเข้าคิว” เพื่อเก็บไฟล์ไว้ในเว็บ
            </p>
          </form>

          {musicResults.length > 0 ? (
            <div className="card overflow-hidden">
              <p className="border-b border-white/5 px-4 py-2 text-[11px] font-medium text-slate-400">ผลการค้นหา {musicResults.length} เพลง</p>
              <ul className="divide-y divide-white/5">
                {musicResults.map((track) => (
                  <li key={`${track.source}:${track.sourceKey}`} className="space-y-2 px-4 py-3">
                    <div className="flex items-center gap-3">
                      {track.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={track.artworkUrl} alt="" width={44} height={44} className="size-11 rounded-lg object-cover ring-1 ring-white/10" />
                      ) : (
                        <span className="flex size-11 items-center justify-center rounded-lg bg-white/5 text-slate-500"><Icon name="music" className="size-4" /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-100">{track.title}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {track.artist}
                          {track.album ? ` · ${track.album}` : ""}
                          {track.durationMs ? ` · ${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, "0")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <span className="badge bg-white/5 text-[10px] text-slate-300 ring-white/10">{track.source === "audius" ? "Audius" : "Archive"}</span>
                        <button
                          type="button"
                          onClick={() => togglePreview(track)}
                          disabled={previewBusy === track.sourceKey}
                          className="btn btn-ghost btn-sm"
                        >
                          <Icon name={previewId === track.sourceKey ? "pause" : "play"} className="size-3.5" />
                          {previewBusy === track.sourceKey ? "กำลังโหลด..." : previewId === track.sourceKey ? "ปิด" : "ฟังเต็มเพลง"}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadTrack(track)}
                          disabled={downloadingId === track.sourceKey}
                          className="btn btn-primary btn-sm"
                        >
                          <Icon name="download" className="size-3.5" />
                          {downloadingId === track.sourceKey ? "กำลังดาวน์โหลด..." : "ดาวน์โหลดเข้าคิว"}
                        </button>
                      </div>
                    </div>
                    {previewId === track.sourceKey && previewSrc ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio controls autoPlay src={previewSrc} className="w-full" />
                    ) : null}
                    {track.license ? <p className="text-[10px] text-slate-600">สิทธิ์: {track.license}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={importFromUrl} className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="link" className="size-4 text-indigo-300" /> นำเข้าเพลงเต็มจากลิงก์ที่คุณมีสิทธิ์
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="sm:col-span-3">
                <span className="label">ลิงก์ไฟล์เสียงตรง (https://...mp3 / m4a / ogg)</span>
                <input className="input font-mono text-xs" value={importForm.url} onChange={(e) => setImportForm({ ...importForm, url: e.target.value })} placeholder="https://example.com/song.mp3" />
              </label>
              <label>
                <span className="label">ชื่อเพลง</span>
                <input className="input" value={importForm.title} onChange={(e) => setImportForm({ ...importForm, title: e.target.value })} placeholder="ชื่อเพลง" />
              </label>
              <label>
                <span className="label">ศิลปิน</span>
                <input className="input" value={importForm.artist} onChange={(e) => setImportForm({ ...importForm, artist: e.target.value })} placeholder="ศิลปิน" />
              </label>
              <div className="flex items-end">
                <button className="btn btn-ghost w-full" disabled={!importForm.url || !importForm.title}>
                  นำเข้าเข้าคิว
                </button>
              </div>
            </div>
          </form>

          <div className="card overflow-hidden">
            <p className="border-b border-white/5 px-4 py-2 text-[11px] font-medium text-slate-400">คลังเพลงในเว็บ ({musicSongs.length})</p>
            {musicSongs.length === 0 ? (
              <div className="p-4"><Empty icon="music" title="ยังไม่มีเพลง" hint="ค้นหาเพลงด้านบนแล้วกดดาวน์โหลด" /></div>
            ) : (
              <ul className="divide-y divide-white/5">
                {musicSongs.map((song) => (
                  <li key={song.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-100">{song.title}</p>
                      <p className="truncate text-[11px] text-slate-400">{song.artist}{song.added_by_nickname ? ` · เพิ่มโดย ${song.added_by_nickname}` : ""}</p>
                    </div>
                    {song.queue_status ? (
                      <span className="badge bg-indigo-500/15 text-indigo-300 ring-indigo-400/30">
                        {song.queue_status === "playing" ? "กำลังเล่น" : "อยู่ในคิว"}
                      </span>
                    ) : null}
                    <button onClick={() => removeSong(song)} className="rounded p-1 text-slate-500 hover:text-rose-300" title="ลบเพลง">
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* ─── Audit ─── */}
      {tab === "audit" ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-white/5">
            {logs.length === 0 ? <li className="p-6"><Empty icon="shield" title="ยังไม่มีบันทึก" /></li> : null}
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs hover:bg-white/[0.02]">
                <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">{log.action}</span>
                <span className="text-slate-200">{log.actor_nickname ?? "ระบบ"}</span>
                {log.actor_role ? <RoleBadge role={log.actor_role} className="!px-1.5 !py-0 !text-[9px]" /> : null}
                <span className="min-w-0 flex-1 truncate text-slate-400">{log.detail ?? log.target ?? "—"}</span>
                <span className="text-[10px] text-slate-600" title={formatDateTime(log.created_at)}>
                  {relativeTime(log.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
