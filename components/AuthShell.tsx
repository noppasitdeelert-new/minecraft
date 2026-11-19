import Link from "next/link";
import { Icon } from "./icons";

const FEATURES = [
  { icon: "bell", title: "ประกาศปักหมุด", text: "ข่าวสำคัญของห้องไม่หลุดอีกต่อไป พร้อมแจ้งเตือนเข้า Discord / LINE" },
  { icon: "video", title: "ประชุมออนไลน์", text: "เปิดห้องประชุมด้วยเสียง-วิดีโอ ยกมือ และจดบันทึกสรุปผลในที่เดียว" },
  { icon: "tasks", title: "ติดตามการบ้าน", text: "แยกตามวิชา ดูวันครบกำหนด และอัปเดตสถานะงานของตัวเองได้" },
];

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-white/8 p-10 lg:flex xl:p-14">
        <div className="absolute -top-32 -left-24 size-96 rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="absolute right-0 bottom-0 size-96 translate-x-1/3 translate-y-1/3 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white shadow-lg shadow-indigo-900/40">
              SK
            </span>
            <span>
              <span className="block text-base font-bold tracking-wide text-white">SKC105 Room Hub</span>
              <span className="block text-xs text-slate-400">ศูนย์กลางห้องเรียนของเรา</span>
            </span>
          </Link>

          <h1 className="mt-14 max-w-md text-4xl leading-tight font-bold tracking-tight text-white">
            ทุกเรื่องของห้อง <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">SKC105</span>{" "}
            อยู่ในที่เดียว
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            ประกาศ การบ้าน ตารางเรียน ห้องประชุม แชต และคลังไฟล์สรุป — ทำงานร่วมกันได้ทันทีด้วยระบบยืนยันตัวตนผ่านอีเมลและคีย์ห้องแบบใช้ครั้งเดียว
          </p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 rounded-xl bg-white/5 p-2 text-indigo-300 ring-1 ring-inset ring-white/10">
                  <Icon name={f.icon} className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{f.title}</p>
                  <p className="text-xs text-slate-400">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} SKC105 Room Hub · สงวนสิทธิ์เฉพาะสมาชิกห้อง</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}
