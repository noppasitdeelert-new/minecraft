# SKC105 Room Hub

Full-stack web application สำหรับจัดการห้อง **SKC105** — ประกาศ แชต ห้องประชุมออนไลน์ การบ้าน ตารางเรียน เช็กชื่อ โหวต คลังไฟล์ ยืม-คืนของ แกลเลอรี **ห้องฟังเพลงรวม** และหน้าแอดมิน พร้อมระบบยืนยันตัวตนด้วย **คีย์ห้องใช้ครั้งเดียว + อีเมล/รหัสผ่าน**

UI ภาษาไทย ธีมมืดทันสมัย (indigo/violet glassmorphism) และ responsive ทั้งมือถือและคอมพิวเตอร์ (sidebar บนเดสก์ท็อป / bottom-nav + drawer บนมือถือ)

---

## 1. เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend + Backend | Next.js 16 (App Router, React 19, Server Components + Route Handlers) |
| ฐานข้อมูล | Cloudflare **D1** (SQLite แบบ managed) ผ่าน binding `DB` — schema/seed สร้างอัตโนมัติเมื่อเรียกครั้งแรก |
| Styling | Tailwind CSS v4 |
| รหัสผ่าน | `PBKDF2-SHA256` (100,000 รอบ) ผ่าน WebCrypto + salt สุ่ม เก็บเฉพาะค่าแฮช |
| Session | HttpOnly cookie + ตาราง `sessions` (token สุ่ม 32 bytes, อายุ 30 วัน) |
| ห้องประชุม | Jitsi Meet ผ่าน iframe + presence/ยกมือ/แชต/โน้ตของระบบเอง |
| เพลง | ดาวน์โหลด **เพลงเต็ม** จาก Audius / Internet Archive / อัปโหลดไฟล์เอง / ลิงก์ตรง เก็บใน **R2** (binding `FILES`), มินิเพลเยอร์เล่นต่อเนื่องทุกหน้า (ยกเว้นห้องประชุม) |
| Realtime | Polling (แชต 3 วิ, ประชุม 4 วิ, เพลง 6 วิ) — ทำงานได้ทุกโฮสต์โดยไม่ต้องเปิด WebSocket |
| แจ้งเตือน | Webhook (Discord / LINE Notify / JSON) สูงสุด 50 รายการ + API Key สำหรับเรียกจากภายนอก + Browser Notification |

> รันได้ทั้งบน **Cloudflare Workers (Freebuff Sites)** และในเครื่องด้วย `wrangler dev` ซึ่งจำลอง D1/R2 ให้อัตโนมัติ (ต้องใช้ Node.js 20 ขึ้นไปสำหรับเครื่องมือ build)

---

## 2. โครงสร้างโปรเจกต์

```
app/
├─ layout.tsx                # root layout + ฟอนต์ไทย
├─ globals.css               # design system (card, btn, input, badge ...)
├─ page.tsx                  # / → /home หรือ /login
├─ login/page.tsx            # หน้าเข้าสู่ระบบ (อีเมล + รหัสผ่าน)
├─ register/page.tsx         # หน้าสมัครด้วยคีย์ห้อง + รหัสผ่าน
├─ (app)/                    # กลุ่มหน้าที่ต้องล็อกอิน (มี Shell + sidebar/bottom-nav)
│  ├─ layout.tsx             # guard + Shell
│  ├─ home/page.tsx          # Dashboard: ประกาศปักหมุด, งานใกล้ส่ง, ตารางวันนี้, เช็กชื่อ
│  ├─ chat/page.tsx          # แชตแยกห้องย่อย
│  ├─ meeting/page.tsx       # ประชุมออนไลน์ + ผู้เข้าร่วม + ยกมือ + แชต + notes
│  ├─ tasks/page.tsx         # การบ้านแยกวิชา + สถานะรายคน
│  ├─ schedule/page.tsx      # ตารางเรียน / เวร / นัดหมาย / เช็กชื่อ
│  ├─ hub/page.tsx           # โหวต / ชีทเรียน / ถาม-ตอบ / ยืม-คืน / แกลเลอรี
│  ├─ music/page.tsx         # ห้องฟังเพลงรวม + คิวเพลง
│  └─ admin/page.tsx         # คีย์ห้อง / สมาชิก+ยศ / webhook / API keys / เพลง / audit logs
└─ api/
   ├─ auth/{register,login,logout}
   ├─ music, music/queue, music/next, music/[id]/audio
   ├─ admin/{keys,users,audit,settings,integrations,music,music/search}
   ├─ hooks/notify           # เรียกด้วย API Key เพื่อส่งแจ้งเตือน
   ├─ notifications          # ฟีดสำหรับ Browser Notification
   └─ chat, announcements, tasks, schedule, attendance, meetings, polls,
      resources, qa, inventory, gallery

components/    # Shell, AuthShell, LoginForm, RegisterForm, ChatClient, MeetingClient,
               # TasksClient, ScheduleClient, AdminClient, MusicClient, MusicPlayerProvider,
               # NotificationPrompt,
               # AnnouncementBoard, AttendanceWidget, hub/*, ui.tsx, icons.tsx
lib/           # db.ts (schema+seed), auth.ts, music.ts, integrations.ts,
               # api.ts, client.ts, format.ts, labels.ts, types.ts, image.ts
data/          # skc105.db (สร้างอัตโนมัติ) + music/ (ไฟล์เพลง) — ถูก gitignore
```

---

## 3. Database Schema

ไฟล์: `data/skc105.db` (สร้างตาราง + seed อัตโนมัติเมื่อรันครั้งแรก)

**บัญชีและการยืนยันตัวตน**

| ตาราง | คอลัมน์สำคัญ |
| --- | --- |
| `users` | `id, email (unique), real_name, nickname, role (owner/admin/moderator/member), status (active/suspended), password_hash, avatar_color, created_at, last_login_at` |
| `invite_keys` | `id, code (unique, SKC105-XXXXXX), note, created_by, created_at, used_by, used_at` — **ลบแถวทันทีที่สมัครสำเร็จ** |
| `sessions` | `id (token), user_id, user_agent, created_at, expires_at` |
| `api_keys` | `id, name, prefix, key_hash (SHA-256), enabled, created_by, created_at, last_used_at, revoked_at` |
| `webhooks` | `id, name, kind (discord/line/custom), url, secret (LINE token), enabled, last_status, last_sent_at` |
| `audit_logs` | `id, actor_id, action, target, detail, created_at` |
| `settings` | `key, value` (เช่น webhook เดิม, สถานะ seed) |

**การสื่อสาร**

| ตาราง | คอลัมน์สำคัญ |
| --- | --- |
| `channels` | `id, slug, name, description, icon, sort_order` |
| `messages` | `id, channel_id, user_id, body, created_at` |
| `announcements` | `id, author_id, title, body, pinned, important, created_at, updated_at` |
| `meetings` | `id, title, agenda, room_code (unique), starts_at, status, notes, created_by, created_at` |
| `meeting_participants` | `meeting_id + user_id (PK), hand_raised, joined_at, last_seen` |
| `meeting_messages` | `id, meeting_id, user_id, body, created_at` |

**งาน กิจกรรม และคลังห้อง**

| ตาราง | คอลัมน์สำคัญ |
| --- | --- |
| `tasks` | `id, subject, title, description, due_date, created_by, created_at` |
| `task_status` | `task_id + user_id (PK), status (todo/doing/done), updated_at` |
| `schedule_entries` | `id, kind (class/duty/event), title, subject, location, day_of_week, start_time, end_time, date, note` |
| `attendance` | `id, user_id, date, status, note, UNIQUE(user_id,date)` |
| `polls` / `poll_options` / `poll_votes` | `UNIQUE(poll_id, user_id)` → **1 บัญชี 1 เสียง** |
| `resources` | `id, title, description, url, category, subject` |
| `qa_posts` / `qa_answers` | กระทู้ถาม-ตอบ + `resolved` |
| `inventory_items` / `inventory_loans` | ของส่วนกลาง + ประวัติยืม/คืน |
| `gallery_photos` | `id, user_id, title, image_url, caption, created_at` |

**เพลง**

| ตาราง | คอลัมน์สำคัญ |
| --- | --- |
| `songs` | `id, title, artist, album, artwork_url, file_path, duration_ms, source_id, source (audius/archive/upload/url/itunes), mime, added_by, created_at` |
| `music_queue` | `id, song_id, added_by, status (pending/playing/played), created_at, started_at, played_at` |

> การเล่นเพลงใช้ `status = 'playing'` + `started_at` เป็นนาฬิกากลาง ทุกเครื่องจึงคำนวณตำแหน่งเพลงจากเวลาเซิร์ฟเวอร์เดียวกัน และขึ้นเพลงถัดไปในคิวพร้อมกัน

---

## 4. การตั้งค่า Environment Variables

```bash
cp .env.example .env   # แล้วแก้ค่า
```

| ตัวแปร | จำเป็น | ความหมาย |
| --- | --- | --- |
| `SESSION_SECRET` | ✔ | ความลับของระบบ — สร้างด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | – | URL จริงของเว็บ เช่น `https://skc105.example.com` |
| `ADMIN_EMAIL` | ✔ | อีเมลแอดมินสูงสุด |
| `ADMIN_NAME`, `ADMIN_NICKNAME` | – | ชื่อจริง/ชื่อเล่นของแอดมินสูงสุด |
| `ADMIN_BOOTSTRAP_PASSWORD` | ✔ | รหัสผ่านของแอดมินสูงสุด (ระบบซิงก์ให้ทุกครั้งที่รัน) |
| `JITSI_DOMAIN` | – | โดเมน Jitsi เช่น `meet.jit.si` |
| `AUDIUS_APP_NAME` | – | ชื่อแอปที่ส่งให้ Audius API (ค่าเริ่มต้น `SKC105 Room Hub`) |
| `DISCORD_WEBHOOK_URL`, `LINE_WEBHOOK_URL` | – | Webhook เริ่มต้น (เพิ่มอีกได้ที่หน้า `/admin`) |
| `EXA_API_KEY` | – | ใช้กับ `GET /api/search` (ไม่บังคับ) |

### บัญชีแอดมินสูงสุด

สร้าง/ซิงก์อัตโนมัติทุกครั้งที่เซิร์ฟเวอร์เริ่มทำงาน จาก `ADMIN_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD`
ถ้าเปลี่ยนรหัสผ่านใน `.env` แล้วรีสตาร์ท ระบบจะตั้งรหัสผ่านใหม่ให้บัญชีนี้ทันที (บัญชีนี้เป็น `owner` แก้ยศ/ระงับจากหน้าแอดมินไม่ได้)

### Webhook & API Key (หน้า `/admin` → แท็บ “API & Webhook”)

- **Webhook** สูงสุด **50 รายการ** เลือกประเภทได้: `Discord` (ส่ง `content`), `LINE Notify` (form `message` + Bearer token) หรือ `custom` (JSON `{message, source, sentAt}`)
- **API Key** สูงสุด **50 คีย์** — คีย์เต็มแสดงครั้งเดียวตอนสร้าง ระบบเก็บเฉพาะ SHA-256
- เรียกจากภายนอก:
  ```bash
  curl -X POST https://your-domain/api/hooks/notify \
    -H "Authorization: Bearer skc_xxxxxxxx" \
    -H "Content-Type: application/json" \
    -d '{"message":"แจ้งเตือนจากบอต"}'
  ```
  ข้อความจะถูกส่งไปทุก Webhook ที่เปิดใช้งาน

ระบบแจ้งเตือนอัตโนมัติเมื่อ: ประกาศสำคัญ/ปักหมุด, งานใหม่, โพลใหม่, ห้องประชุมใหม่, สมาชิกใหม่, การระงับ/เปิดบัญชี

### Browser Notification

แถบขออนุญาตจะแสดงด้านบนหน้าแรกหลังล็อกอิน — กด “อนุญาตการแจ้งเตือน” แล้วเบราว์เซอร์จะแจ้งเมื่อมีประกาศใหม่ (ตรวจสอบทุก 45 วินาที) ปิด/เปิดได้ที่การตั้งค่าเบราว์เซอร์

### เพลงเต็ม (หน้า `/admin` → แท็บ “เพลง”)

มี 4 วิธีนำเพลง**เต็มเพลง**เข้าเว็บ (รองรับชื่อเพลง/ศิลปินทุกภาษา ทั้งไทย อังกฤษ ญี่ปุ่น เกาหลี ฯลฯ):

1. **ค้นหา Audius** — เพลงเต็มของศิลปินอิสระ สตรีม/ดาวน์โหลดได้ทั้งเพลง (ไม่ต้องใช้คีย์)
2. **ค้นหา Internet Archive** — บันทึกเสียงสาธารณสมบัติ/Creative Commons ค้นหาภาษาไทยได้
3. **อัปโหลดไฟล์จากเครื่อง** — mp3 / m4a / ogg / wav / flac สูงสุด 60 MB (ใช้ไฟล์ที่คุณมีสิทธิ์)
4. **นำเข้าจากลิงก์ตรง** — URL ไฟล์เสียงที่คุณมีสิทธิ์

ขั้นตอน: ค้นหา → กด “ฟังเต็มเพลง” → “ดาวน์โหลดเข้าคิว” ระบบจะดาวน์โหลดไฟล์เต็มเก็บลง R2 แล้วเข้าคิวทันที

**การเล่น:** มินิเพลเยอร์ลอยอยู่มุมล่างของ**ทุกหน้า**และเล่นต่อเนื่องเมื่อเปลี่ยนหน้า — ยกเว้นหน้า `/meeting` ที่จะหยุดชั่วคราวและกลับมาเล่นต่อเมื่อออกจากห้องประชุม ทุกเครื่องเล่นเพลงเดียวกันตามเวลากลางของเซิร์ฟเวอร์ (หน้า `/music` มีคิวและคลังเพลงเต็มรูปแบบ)

> ไฟล์เพลงเต็มของศิลปินที่มีลิขสิทธิ์ไม่สามารถดาวน์โหลดอัตโนมัติได้ — ใช้การอัปโหลด/ลิงก์ตรงกับไฟล์ที่คุณมีสิทธิ์ หรือใช้คลังเพลงอิสระ/สาธารณสมบัติข้างต้น

---

## 5. วิธีรัน

```bash
npm install          # ติดตั้ง dependencies
cp .env.example .env # แล้วแก้ค่าอย่างน้อย SESSION_SECRET + ADMIN_*
npx wrangler dev --config freebuff.wrangler.jsonc --port 8787   # โหมดพัฒนา (D1/R2 จำลองในเครื่อง) → http://localhost:8787
```

โปรดักชัน:

```bash
npm run build        # build ฝั่ง Next.js
npm start            # รันเป็น Node server (ต้องมี D1/R2 ให้เชื่อม — ปกติใช้ deploy ขึ้น Sites แทน)
```

ตรวจชนิดข้อมูล: `npm run typecheck`

---

## 6. Flow การทำงานหลัก

### สมัครสมาชิก (คีย์ใช้ครั้งเดียว)
1. แอดมินกดสร้างคีย์ที่ `/admin` → ได้ `SKC105-XXXXXX` (1 คีย์ = 1 บัญชี)
2. ผู้ใช้กรอกคีย์ + อีเมล + ชื่อจริง + ชื่อเล่น + รหัสผ่าน (ยืนยันรหัสผ่าน) ที่ `/register`
3. ระบบตรวจคีย์/อีเมลซ้ำ → **`DELETE FROM invite_keys`** ก่อนสร้างบัญชี (ถ้าสร้างบัญชีไม่สำเร็จจะคืนคีย์ให้อัตโนมัติ) → ล็อกอินทันที + บันทึก Audit Log

### ล็อกอิน
- `POST /api/auth/login` → ตรวจอีเมล + รหัสผ่านด้วย PBKDF2 แบบ timing-safe → สร้าง session cookie (30 วัน)
- บัญชีที่ถูกระงับจะถูกตัด session ทั้งหมดและล็อกอินไม่ได้

### ห้องประชุม
- แอดมิน/ผู้ดูแลสร้างห้อง → ได้ `room_code`
- เปิด iframe ของ `https://<JITSI_DOMAIN>/<room_code>` (กล้อง/ไมค์)
- presence ผ่าน `meeting_participants` (heartbeat 20 วิ), ปุ่มยกมือ, แชตระหว่างประชุม, บันทึกโน้ตสรุป

---

## 7. สิทธิ์การใช้งาน (Roles)

| การกระทำ | owner | admin | moderator | member |
| --- | :-: | :-: | :-: | :-: |
| สร้างคีย์เชิญ / ดูรายชื่อสมาชิก / Audit / API Key / Webhook | ✔ | ✔ | – | – |
| ตั้งยศ “แอดมิน” | ✔ | – | – | – |
| ค้นหา/ดาวน์โหลด/ลบเพลง | ✔ | ✔ | – | – |
| ประกาศ + ปักหมุด + Webhook | ✔ | ✔ | ✔ | – |
| สร้างห้องประชุม / แก้ตารางเรียน / เพิ่มของส่วนกลาง | ✔ | ✔ | ✔ | – |
| แชต / การบ้าน / โหวต / ยืมของ / แชร์ไฟล์ / ถาม-ตอบ / ฟังเพลง / เพิ่มเพลงเข้าคิว | ✔ | ✔ | ✔ | ✔ |

> การระงับบัญชีจะลบ session ทั้งหมดทันที · เฉพาะ `owner` ตั้งยศ “แอดมิน” ได้

---

## 8. หมายเหตุความปลอดภัย & การดีพลอย

- Session เป็น HttpOnly + SameSite=Lax, `secure` อัตโนมัติเมื่อ `NODE_ENV=production`
- รหัสผ่านเก็บเป็น PBKDF2-SHA256 hash พร้อม salt ไม่เก็บ plaintext; API Key เก็บเฉพาะ SHA-256
- ลิงก์นำเข้าเพลงต้องเป็น https เท่านั้น, บล็อกที่อยู่ภายใน/LAN และจำกัดไฟล์สูงสุด 60 MB ต่อเพลง
- ทุก endpoint ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อ role ที่ส่งมาจาก client)
- รูปแกลเลอรีถูกย่อขนาดในเบราว์เซอร์ก่อนอัปโหลด เก็บเป็น data URL (จำกัด ~2 MB/รูป)
- **การดีพลอย**: ดีพลอยบน **Freebuff Sites (Cloudflare Workers)** แล้ว — Worker เสิร์ฟ Next.js ผ่าน OpenNext, ฐานข้อมูลอยู่บน D1, ไฟล์เพลงอยู่บน R2 (ไม่ต้องมีดิสก์ถาวร)
- แนะนำวาง Nginx/Caddy ทำ HTTPS ด้านหน้า แล้วตั้ง `APP_URL` ให้ตรงโดเมนจริง
- สำรองข้อมูล = export D1 (`wrangler d1 export`) และคัดลอกออบเจกต์ใน bucket R2 `FILES`
