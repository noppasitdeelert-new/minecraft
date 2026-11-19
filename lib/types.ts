import type { Role, UserStatus } from "./labels";

export type PublicUser = {
  id: number;
  nickname: string;
  real_name: string;
  role: Role;
  avatar_color: string;
  email?: string;
  status?: UserStatus;
};

export type Channel = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  message_count?: number;
};

export type ChatMessage = {
  id: number;
  channel_id: number;
  body: string;
  created_at: string;
  user: PublicUser;
};

export type Announcement = {
  id: number;
  title: string;
  body: string;
  pinned: number;
  important: number;
  created_at: string;
  author: PublicUser;
};

export type Meeting = {
  id: number;
  title: string;
  agenda: string | null;
  room_code: string;
  starts_at: string;
  status: "scheduled" | "live" | "ended";
  notes: string | null;
  created_at: string;
  host: PublicUser;
  participant_count?: number;
};

export type MeetingParticipant = {
  user_id: number;
  hand_raised: number;
  joined_at: string;
  last_seen: string;
  nickname: string;
  role: Role;
  avatar_color: string;
};

export type Task = {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  author: PublicUser;
  my_status: "todo" | "doing" | "done";
  done_count: number;
  doing_count: number;
  total_members: number;
  my_updated_at: string | null;
};

export type ScheduleEntry = {
  id: number;
  kind: "class" | "duty" | "event";
  title: string;
  subject: string | null;
  location: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  date: string | null;
  note: string | null;
};

export type AttendanceRecord = {
  user_id: number;
  nickname: string;
  role: Role;
  avatar_color: string;
  status: string | null;
  note: string | null;
  created_at: string | null;
};

export type PollOption = { id: number; label: string; votes: number; voters: string[] };
export type Poll = {
  id: number;
  question: string;
  description: string | null;
  status: "open" | "closed";
  created_at: string;
  author: PublicUser;
  options: PollOption[];
  my_option_id: number | null;
  total_votes: number;
};

export type Resource = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  category: string;
  subject: string | null;
  created_at: string;
  author: PublicUser;
};

export type QaAnswer = { id: number; body: string; created_at: string; author: PublicUser };
export type QaPost = {
  id: number;
  title: string;
  body: string;
  subject: string | null;
  resolved: number;
  created_at: string;
  author: PublicUser;
  answers: QaAnswer[];
};

export type InventoryItem = {
  id: number;
  name: string;
  description: string | null;
  total_qty: number;
  borrowed_qty: number;
  loans: Array<{
    id: number;
    qty: number;
    borrowed_at: string;
    due_at: string | null;
    returned_at: string | null;
    borrower: PublicUser;
  }>;
};

export type GalleryPhoto = {
  id: number;
  title: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  author: PublicUser;
};

export type AdminMember = {
  id: number;
  email: string;
  real_name: string;
  nickname: string;
  role: Role;
  status: UserStatus;
  avatar_color: string;
  created_at: string;
  last_login_at: string | null;
  message_count: number;
};

export type InviteKey = {
  id: number;
  code: string;
  note: string | null;
  created_at: string;
  used_at: string | null;
  used_by_nickname: string | null;
  creator_nickname: string | null;
};

export type MusicSong = {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  duration_ms: number | null;
  source: string;
  mime: string;
  added_by_nickname: string | null;
  created_at: string;
  queue_status: string | null;
};

export type MusicQueueEntry = {
  queue_id: number;
  song_id: number;
  title: string;
  artist: string;
  artwork_url: string | null;
  duration_ms: number | null;
  added_by_nickname: string | null;
  added_by_id: number | null;
  created_at: string;
};

export type MusicState = {
  current: (MusicQueueEntry & { started_at: string }) | null;
  queue: MusicQueueEntry[];
  history: MusicQueueEntry[];
};

export type WebhookItem = {
  id: number;
  name: string;
  kind: string;
  url: string;
  secret: string | null;
  enabled: number;
  created_at: string;
  last_status: string | null;
  last_sent_at: string | null;
};

export type ApiKeyItem = {
  id: number;
  name: string;
  prefix: string;
  enabled: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type AuditLog = {
  id: number;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
  actor_nickname: string | null;
  actor_role: Role | null;
};
