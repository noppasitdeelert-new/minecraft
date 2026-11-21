export type Role = "owner" | "admin" | "moderator" | "member";
export type UserStatus = "active" | "suspended";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "แอดมินสูงสุด",
  admin: "แอดมิน",
  moderator: "ผู้ดูแล",
  member: "สมาชิก",
};

export const ROLE_STYLE: Record<Role, string> = {
  owner: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  admin: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  moderator: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  member: "bg-slate-500/15 text-slate-300 ring-slate-400/30",
};

export const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };

export const STATUS_LABEL: Record<UserStatus, string> = {
  active: "ใช้งานอยู่",
  suspended: "ระงับการใช้งาน",
};

export const STATUS_STYLE: Record<UserStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  suspended: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "ยังไม่เริ่ม",
  doing: "กำลังทำ",
  done: "เสร็จแล้ว",
};

export const TASK_STATUS_STYLE: Record<string, string> = {
  todo: "bg-slate-500/15 text-slate-300 ring-slate-400/30",
  doing: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  done: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
};

export const ATTENDANCE_LABEL: Record<string, string> = {
  present: "มาเรียน",
  late: "มาสาย",
  sick: "ลาป่วย",
  leave: "ลากิจ",
  absent: "ขาดเรียน",
};

export const ATTENDANCE_STYLE: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  late: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  sick: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  leave: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  absent: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};

export const RESOURCE_CATEGORY_LABEL: Record<string, string> = {
  sheet: "ชีทสรุป",
  exam: "ข้อสอบเก่า",
  slide: "สไลด์เรียน",
  video: "วิดีโอ",
  other: "อื่น ๆ",
};

export const XP_REASON_LABEL: Record<string, string> = {
  "attendance.checkin": "เช็กชื่อเข้าห้อง",
  "task.done": "ทำการบ้านเสร็จ",
  "poll.vote": "ร่วมโหวตในห้อง",
  "resource.create": "แชร์ชีท/ไฟล์เรียน",
  "qa.answer": "ช่วยตอบคำถามเพื่อน",
  "admin.adjust": "แอดมินปรับแต้ม",
  "shop.redeem": "แลกของรางวัลด้วย XP",
  "shop.refund": "คืนแต้มจากการแลกรางวัล",
  "meeting.join": "เข้าร่วมประชุม",
  "chat.message": "ส่งข้อความในห้อง",
};

export const DAY_LABEL: Record<number, string> = {
  0: "อาทิตย์",
  1: "จันทร์",
  2: "อังคาร",
  3: "พุธ",
  4: "พฤหัสบดี",
  5: "ศุกร์",
  6: "เสาร์",
};
