"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { useGameLive } from "@/lib/use-game-live";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import { Alert, Avatar, Empty, SectionCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { LanNetwork, LanRoomView } from "@/lib/lan";

type Payload = { rooms: LanRoomView[]; maxOpen: number };

type Draft = {
  name: string;
  network: LanNetwork;
  networkId: string;
  hostAddress: string;
  port: string;
  mcVersion: string;
  note: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  network: "zerotier",
  networkId: "",
  hostAddress: "",
  port: "25565",
  mcVersion: "1.21.4",
  note: "",
};

const NETWORKS: Array<{
  key: LanNetwork;
  label: string;
  tagline: string;
  site: string;
  steps: string[];
}> = [
  {
    key: "zerotier",
    label: "ZeroTier",
    tagline: "ฟรี ใช้ได้ทุกระบบ เหมาะกับกลุ่มเพื่อนที่ไม่ได้อยู่บ้านเดียวกัน",
    site: "https://www.zerotier.com/download/",
    steps: [
      "ทุกเครื่องโหลด ZeroTier One จากเว็บแล้วติดตั้ง เปิดโปรแกรมค้างไว้",
      "เจ้าของห้องเข้า my.zerotier.com กด Create A Network จะได้ Network ID 16 ตัวอักษร",
      "กดที่ Network นั้น → ตั้ง Access Control เป็น Private แล้วเพิ่มเครื่องเพื่อนใน Members (ยังไม่ต่อก็กด Auth ภายหลังได้)",
      "ทุกคนกด Join Network แล้วใส่ Network ID เดียวกัน รอสถานะ OK",
      "ดู IP ที่โปรแกรมให้มา (มักขึ้นต้น 10.x หรือ 172.x) — IP ของเจ้าของห้องคือค่าที่เอาไปใส่ในช่อง “IP ของเครื่องเจ้าของห้อง”",
      "เจ้าของห้องเปิดโลกในไมน์ → Open to LAN → เอาเลขพอร์ตที่เกมบอกมาใส่ในช่องพอร์ต",
      "เพื่อนเข้า Multiplayer → Direct Connect → พิมพ์ IP:port แล้ว Join",
    ],
  },
  {
    key: "tailscale",
    label: "Tailscale",
    tagline: "ตั้งง่ายสุด ล็อกอินบัญชีเดียวแล้วแชร์เครื่องได้",
    site: "https://tailscale.com/download",
    steps: [
      "ทุกเครื่องติดตั้ง Tailscale แล้วล็อกอิน (Google / Microsoft / GitHub)",
      "ให้ทุกคนอยู่ใน tailnet เดียวกัน — เจ้าของห้องไปที่ Admin console → Users → Invite ส่งลิงก์ให้เพื่อน หรือใช้บัญชีเดียวกันทั้งกลุ่ม",
      "ดู IP 100.x.x.x ของเจ้าของห้องได้จากแอป Tailscale หรือคำสั่ง tailscale ip -4",
      "เจ้าของห้องเปิดโลก → Open to LAN แล้วจำพอร์ต",
      "เพื่อนเข้า Multiplayer → Direct Connect → 100.x.x.x:พอร์ต",
    ],
  },
  {
    key: "radmin",
    label: "Radmin VPN",
    tagline: "ฟรีสำหรับ Windows สร้างnetwork ด้วยชื่อ + รหัสผ่าน",
    site: "https://www.radmin-vpn.com/",
    steps: [
      "ทุกเครื่อง (Windows) ติดตั้ง Radmin VPN แล้วเปิดโปรแกรม",
      "เจ้าของห้องกด Create Network ตั้งชื่อและรหัสผ่าน แล้วบอกเพื่อน",
      "เพื่อนกด Join Network ใส่ชื่อ + รหัสเดียวกัน",
      "ดู IPv4 26.x.x.x ของเจ้าของห้องในรายการเครื่อง",
      "เจ้าของห้องเปิดโลก → Open to LAN แล้วจำพอร์ต",
      "เพื่อนเข้า Multiplayer → Direct Connect → 26.x.x.x:พอร์ต",
    ],
  },
  {
    key: "other",
    label: "LAN วงเดียวกัน",
    tagline: "อยู่วง Wi-Fi เดียวกัน หรือใช้ VPN ตัวอื่นที่คุณมีอยู่แล้ว",
    site: "",
    steps: [
      "ทุกเครื่องต้องอยู่ในวง LAN เดียวกัน (Wi-Fi/สายเดียวกัน หรือ VPN ที่แชร์วง LAN)",
      "หา IPv4 ของเจ้าของห้องด้วยคำสั่ง ipconfig (Windows) หรือ ifconfig / ip addr (macOS/Linux)",
      "เจ้าของห้องเปิดโลก → Open to LAN แล้วจำพอร์ต",
      "เพื่อนเข้า Multiplayer → Direct Connect → IP:พอร์ต",
    ],
  },
];

export default function LanClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [guide, setGuide] = useState<LanNetwork>("zerotier");

  const load = useCallback(async () => {
    try {
      setData(await apiGet<Payload>("/api/lan/rooms"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายการห้อง LAN ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ห้องใหม่/มีคน join/ปิดห้อง → อัปเดตทันที (สำรองด้วย polling เมื่อเรียลไทม์ไม่พร้อม)
  const live = useGameLive("lan:lobby", () => void load());
  useVisiblePoll(load, live.status === "online" ? 30000 : 8000);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`คัดลอก${label}แล้ว`);
    } catch {
      setError("คัดลอกอัตโนมัติไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl+C เอง");
    }
  }

  async function act(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function create() {
    return act(async () => {
      await apiPost("/api/lan/rooms", {
        name: draft.name,
        network: draft.network,
        networkId: draft.networkId,
        hostAddress: draft.hostAddress,
        port: draft.port,
        mcVersion: draft.mcVersion,
        note: draft.note,
      });
      setDraft({ ...EMPTY_DRAFT, mcVersion: draft.mcVersion });
    }, "สร้างห้อง LAN แล้ว — แชร์โค้ดกับเพื่อนได้เลย");
  }

  function saveEdit() {
    if (!editing) return;
    const current = editing;
    return act(async () => {
      await apiPatch(`/api/lan/rooms/${current.id}`, {
        name: current.draft.name,
        network: current.draft.network,
        networkId: current.draft.networkId,
        hostAddress: current.draft.hostAddress,
        port: current.draft.port,
        mcVersion: current.draft.mcVersion,
        note: current.draft.note,
      });
      setEditing(null);
    }, "บันทึกข้อมูลห้องแล้ว");
  }

  function toggleStatus(room: LanRoomView) {
    return act(
      () => apiPatch(`/api/lan/rooms/${room.id}`, { status: room.status === "open" ? "closed" : "open" }),
      room.status === "open" ? "ปิดรับคนเข้าห้องแล้ว" : "เปิดห้องอีกครั้งแล้ว",
    );
  }

  function remove(room: LanRoomView) {
    if (!window.confirm(`ลบห้อง “${room.name}” ถาวรไหม?`)) return;
    return act(() => apiDelete(`/api/lan/rooms/${room.id}`), "ลบห้องแล้ว");
  }

  const rooms = data?.rooms ?? [];
  const openRooms = rooms.filter((room) => room.status === "open");
  const guideMeta = NETWORKS.find((item) => item.key === guide) ?? NETWORKS[0];

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Alert tone="info">
        หน้านี้ไม่ได้สร้าง VPN ให้เอง — ทำหน้าที่เป็นศูนย์นัดเล่นและแชร์ข้อมูลห้อง (Network ID + IP:port)
        หลังทุกคนต่อ VPN ตัวเดียวกันแล้ว เกมจะมองเห็นกันเหมือนอยู่ใน LAN เดียวกัน
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <SectionCard title="สร้างห้อง LAN ของฉัน" icon="plus">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">ชื่อห้อง</span>
              <input
                className="input"
                value={draft.name}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="เช่น โลกเอาชีวิตรอดห้อง SKC105"
              />
            </label>

            <div className="sm:col-span-2">
              <span className="label">เครือข่าย VPN ที่จะใช้</span>
              <div className="grid grid-cols-2 gap-2">
                {NETWORKS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDraft({ ...draft, network: item.key })}
                    className={`rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                      draft.network === item.key
                        ? "border-indigo-400/60 bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/30"
                        : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">{item.tagline}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="label">Network ID / ชื่อ network</span>
              <input
                className="input"
                value={draft.networkId}
                maxLength={64}
                onChange={(event) => setDraft({ ...draft, networkId: event.target.value })}
                placeholder="เช่น 8056c2e21c000001"
              />
            </label>

            <label className="block">
              <span className="label">เวอร์ชันไมน์คราฟต์</span>
              <input
                className="input"
                value={draft.mcVersion}
                maxLength={30}
                onChange={(event) => setDraft({ ...draft, mcVersion: event.target.value })}
                placeholder="เช่น 1.21.4"
              />
            </label>

            <label className="block">
              <span className="label">IP ของเครื่องเจ้าของห้อง</span>
              <input
                className="input"
                value={draft.hostAddress}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, hostAddress: event.target.value })}
                placeholder="เช่น 10.147.17.5"
              />
            </label>

            <label className="block">
              <span className="label">พอร์ต LAN</span>
              <input
                className="input"
                value={draft.port}
                inputMode="numeric"
                onChange={(event) => setDraft({ ...draft, port: event.target.value })}
                placeholder="25565"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="label">โน้ต</span>
              <textarea
                className="input min-h-20 resize-y"
                value={draft.note}
                maxLength={300}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                placeholder="เช่น เปิดโลกตอนสองทุ่ม โหมดสร้างสรรค์ มีม็อด Xaero's Minimap"
              />
            </label>
          </div>

          <button type="button" onClick={create} disabled={busy || draft.name.trim().length < 2} className="btn btn-primary mt-4 w-full">
            <Icon name="plus" className="size-4" />
            สร้างห้อง LAN
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            เปิดได้สูงสุด {data?.maxOpen ?? 2} ห้องพร้อมกัน และแก้ IP/พอร์ตได้ตลอดหลังเกมขึ้น “Local game hosted on port …”
          </p>
        </SectionCard>

        <SectionCard title="คู่มือต่อ VPN + เปิดโลกแลน" icon="help">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {NETWORKS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setGuide(item.key)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                  guide === item.key
                    ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-inset ring-indigo-400/30"
                    : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <ol className="space-y-2">
            {guideMeta.steps.map((step, index) => (
              <li key={step} className="flex gap-2.5 rounded-lg bg-white/[0.02] px-2.5 py-2 text-xs text-slate-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-[10px] font-bold text-indigo-200">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
            {guideMeta.site ? (
              <a href={guideMeta.site} target="_blank" rel="noreferrer" className="text-indigo-300 underline-offset-2 hover:underline">
                ดาวน์โหลด {guideMeta.label}
              </a>
            ) : null}
            <span className="text-slate-500">
              Windows ต้องกด Allow ใน Firewall สำหรับ javaw.exe (Private network) ไม่งั้นเพื่อนจะต่อไม่ติด
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-semibold text-white">เปิดโลกแลนยังไง</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              เข้าโลกที่เล่นอยู่ → กด Esc → <span className="text-slate-200">Open to LAN</span> → เลือกโหมดเกม →
              เกมจะขึ้นข้อความ “Local game hosted on port 5xxxx” ให้นำเลขนั้นมาใส่ในช่องพอร์ตของห้องนี้
              แล้วให้เพื่อนกด Multiplayer → Direct Connect → พิมพ์ IP:port
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={`ห้อง LAN ที่เปิดอยู่ (${openRooms.length})`}
        icon="globe"
        action={
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span
              className={`size-1.5 rounded-full ${live.status === "online" ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`}
            />
            {live.status === "online" ? "เรียลไทม์" : "รีเฟรชทุก 8 วินาที"}
          </span>
        }
      >
        {data === null ? (
          <p className="py-4 text-center text-xs text-slate-500">กำลังโหลด…</p>
        ) : rooms.length === 0 ? (
          <Empty icon="globe" title="ยังไม่มีห้อง LAN" hint="สร้างห้องด้านบน แล้วชวนเพื่อนเข้าร่วมจากรายการนี้" />
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => {
              const address = `${room.hostAddress ?? "<ยังไม่ใส่ IP>"}:${room.port}`;
              const isEditing = editing?.id === room.id;
              return (
                <div key={room.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                  <div className="flex flex-wrap items-start gap-3">
                    <Avatar name={room.host.nickname} color={room.host.avatarColor} imageUrl={room.host.avatarUrl} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                        {room.name}
                        <span className="badge bg-indigo-500/15 font-mono text-indigo-200 ring-indigo-400/25">{room.code}</span>
                        <span className="badge bg-white/5 text-slate-300 ring-white/10">{room.networkLabel}</span>
                        {room.status === "closed" ? (
                          <span className="badge bg-slate-500/15 text-slate-400 ring-slate-400/20">ปิดแล้ว</span>
                        ) : null}
                        {room.isHost ? (
                          <span className="badge bg-emerald-500/15 text-emerald-200 ring-emerald-400/25">ห้องของฉัน</span>
                        ) : null}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        เจ้าของ: {room.host.nickname}
                        {room.mcVersion ? ` · MC ${room.mcVersion}` : ""}
                        {room.networkId ? ` · Network ${room.networkId}` : ""}
                        {` · ${room.members.length} คนในห้อง`}
                      </p>
                      {room.note ? <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{room.note}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copy(address, "ที่อยู่ LAN")}
                        className="btn btn-ghost btn-sm font-mono"
                        title="คัดลอก IP:port"
                      >
                        <Icon name="copy" className="size-3.5" />
                        {address}
                      </button>
                      {room.networkId ? (
                        <button
                          type="button"
                          onClick={() => copy(room.networkId ?? "", " Network ID")}
                          className="btn btn-ghost btn-sm"
                          title="คัดลอก Network ID"
                        >
                          <Icon name="copy" className="size-3.5" />
                          Network ID
                        </button>
                      ) : null}
                      {!room.isHost && room.status === "open" ? (
                        room.joined ? (
                          <button
                            type="button"
                            onClick={() => act(() => apiDelete(`/api/lan/rooms/${room.id}/join`), "ออกจากห้องแล้ว")}
                            disabled={busy}
                            className="btn btn-ghost btn-sm"
                          >
                            ออกจากห้อง
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => act(() => apiPost(`/api/lan/rooms/${room.id}/join`), "เข้าร่วมห้องแล้ว")}
                            disabled={busy}
                            className="btn btn-primary btn-sm"
                          >
                            เข้าร่วม
                          </button>
                        )
                      ) : null}
                      {room.isHost ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEditing(
                                isEditing
                                  ? null
                                  : {
                                      id: room.id,
                                      draft: {
                                        name: room.name,
                                        network: room.network,
                                        networkId: room.networkId ?? "",
                                        hostAddress: room.hostAddress ?? "",
                                        port: String(room.port),
                                        mcVersion: room.mcVersion ?? "",
                                        note: room.note ?? "",
                                      },
                                    },
                              )
                            }
                            className="btn btn-ghost btn-sm"
                          >
                            <Icon name="edit" className="size-3.5" />
                            {isEditing ? "ย้อนกลับ" : "แก้ไข"}
                          </button>
                          <button type="button" onClick={() => toggleStatus(room)} disabled={busy} className="btn btn-ghost btn-sm">
                            {room.status === "open" ? "ปิดห้อง" : "เปิดห้อง"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(room)}
                            disabled={busy}
                            className="btn btn-ghost btn-sm text-rose-300"
                            title="ลบห้อง"
                          >
                            <Icon name="trash" className="size-3.5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {room.members.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {room.members.map((member) => (
                        <span
                          key={member.id}
                          className="flex items-center gap-1.5 rounded-full bg-white/[0.04] py-0.5 pl-0.5 pr-2 text-[11px] text-slate-300"
                        >
                          <Avatar name={member.nickname} color={member.avatarColor} size={18} />
                          {member.nickname}
                          {member.isHost ? <span className="text-[10px] text-emerald-300">host</span> : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {isEditing && editing ? (
                    <div className="mt-3 grid gap-2.5 rounded-xl border border-white/10 bg-[#0a1020]/60 p-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="label">ชื่อห้อง</span>
                        <input
                          className="input"
                          value={editing.draft.name}
                          maxLength={60}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: { ...editing.draft, name: event.target.value } })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="label">Network ID</span>
                        <input
                          className="input"
                          value={editing.draft.networkId}
                          maxLength={64}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: { ...editing.draft, networkId: event.target.value } })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="label">เวอร์ชันไมน์คราฟต์</span>
                        <input
                          className="input"
                          value={editing.draft.mcVersion}
                          maxLength={30}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: { ...editing.draft, mcVersion: event.target.value } })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="label">IP ของเครื่องเจ้าของห้อง</span>
                        <input
                          className="input"
                          value={editing.draft.hostAddress}
                          maxLength={80}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: { ...editing.draft, hostAddress: event.target.value } })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="label">พอร์ต LAN</span>
                        <input
                          className="input"
                          value={editing.draft.port}
                          inputMode="numeric"
                          onChange={(event) =>
                            setEditing({ ...editing, draft: { ...editing.draft, port: event.target.value } })
                          }
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="label">โน้ต</span>
                        <textarea
                          className="input min-h-16 resize-y"
                          value={editing.draft.note}
                          maxLength={300}
                          onChange={(event) =>
                            setEditing({ ...editing, draft: { ...editing.draft, note: event.target.value } })
                          }
                        />
                      </label>
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="button" onClick={saveEdit} disabled={busy} className="btn btn-primary btn-sm">
                          บันทึก
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="กติกาและความปลอดภัย" icon="shield">
        <ul className="space-y-1.5 text-xs leading-relaxed text-slate-400">
          <li>• ใช้เฉพาะ Network ID ของกลุ่มเพื่อนในห้อง ห้ามโพสต์ Network ID/รหัสผ่าน VPN ไว้ที่สาธารณะ</li>
          <li>• Radmin VPN / ZeroTier ที่ตั้ง Private จะเห็นเฉพาะเครื่องที่ได้รับอนุญาต — ตรวจรายชื่อเครื่องในแผงควบคุมก่อนเปิดโลกทุกครั้ง</li>
          <li>• โลกแลนเปิดเฉพาะตอนที่เกมรันอยู่ ปิดเกมเมื่อเล่นเสร็จ และปิดห้อง LAN ในหน้านี้ด้วย</li>
          <li>• เว็บนี้ไม่เก็บไฟล์โลก ไมน์คราฟต์ และไม่ได้อุโมงค์ทราฟฟิกเกมของคุณ</li>
        </ul>
      </SectionCard>
    </div>
  );
}
