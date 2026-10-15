# SEAT PLAN A340 · ผังที่นั่งผู้โดยสารชั่วคราว

เว็บกรอกผังที่นั่งผู้โดยสาร A340 · 1 Sector = 1 ภารกิจ = 1 แท็บ ในไฟล์ Google Sheet **Seat Plan A340 TEMPORARY FOR PASSENGER**
อ่านสภาพที่นั่ง/จอ Monitor (พร้อม NOTE) จากไฟล์ **Seat Plan 340 (For Admin)**

หน้าเว็บ: https://rtaf602.github.io/a340_seatplan_passenger/

## การใช้งาน

1. **เข้าเว็บ**: กด Sign in with Google (เมื่อตั้ง Client ID แล้ว) และใส่รหัสเข้าใช้งาน ทุกครั้งที่เปิดหน้าเว็บใหม่
2. **รายการภารกิจ**: แท็บ ภารกิจที่เปิดอยู่ / ภารกิจที่เสร็จสิ้นเรียบร้อย / ภารกิจทั้งหมด และเลือกห้วงวันที่บินได้
   - **+ เปิดภารกิจใหม่**: Sector, เที่ยวบิน, ชื่อภารกิจ, เส้นทางบิน (IATA), วันที่บิน, รหัสภารกิจ, ชื่อผู้บันทึก
   - เข้าภารกิจต้องใส่ **รหัสภารกิจ** ทุกครั้ง
   - แท็บ **ภารกิจที่เสร็จสิ้นเรียบร้อย** และ **ภารกิจทั้งหมด** ต้อง Login ด้วย Username, Password, เลขบัตรข้าราชการ และวันเดือนปีเกิด (ใช้ได้ 2 ชั่วโมง) ผู้ใช้ทั่วไปเห็นเฉพาะภารกิจที่เปิดอยู่
   - **เปลี่ยนรหัสภารกิจ / ปิดภารกิจ / เปิดภารกิจอีกครั้ง** ต้องยืนยันด้วย Username, Password, เลขบัตรข้าราชการ และวันเดือนปีเกิด (ตรวจกับ LOGIN DATABASE) การเปิดอีกครั้งต้องใช้รหัสภารกิจด้วย
3. **ผังที่นั่ง**: แตะที่นั่งเพื่อกรอก ยศ/ชื่อ/สกุล ภาษาไทย และภาษาอังกฤษ ที่นั่งแสดงชื่อย่อ (มานะ พ. / Mana P.)
   - ปุ่ม **CLEAR** (ล้างเฉพาะรายชื่อ) · **SAVE** (ต้องกรอกชื่อผู้บันทึกทุกครั้ง) · **PREVIEW** · **EXPORT TO PDF** · **PRINT BOARDING PASS**
   - ถ้ามีผู้ SAVE ไปก่อน ระบบไม่บันทึกทับ ให้กด “โหลดข้อมูลล่าสุด” แล้ว SAVE ใหม่
   - ชื่อไฟล์ PDF: `261013_10.44 TH-LT_RTAF201_Seat Plan A340 (Pax).pdf` (เวลาไทย)
4. **ADMIN** (ปุ่มด้านล่าง ต้อง Login): กั้น CREW ZONE จากหัว/ท้ายเครื่อง กรอกรายชื่อลูกเรือ และ PREVIEW / PDF `(CREW)` / Boarding Pass ลูกเรือ · LOGOUT เมื่อเสร็จ
5. **Boarding Pass** 203 × 82.5 มม. A4 ได้ 3 ใบ/แผ่น จัดกึ่งกลาง (ขอบบน-ล่าง 22.75 มม., ข้าง 3.5 มม., ห่างกัน 2 มม., รอยตัดอยู่ในขอบกระดาษ)
   ในหน้าต่างพิมพ์ให้ตั้ง **Scale 100%**, **Margins: None** และเปิด **Background graphics**

## การล็อกเมื่อใส่รหัสผิด

กติกาเดียวกันทุกรหัส: **ผิดติดกัน 5 ครั้ง พัก 60 นาที · ผิดอีก 5 ครั้ง บล็อก** จนแอดมินแก้ช่องสถานะเป็น `ACTIVE` ในไฟล์ Admin Page

| ใส่ผิดตอน | นับที่ | ปลดบล็อก |
|---|---|---|
| รหัสผ่านเว็บไซต์ | Email | แท็บ `LOCKED EMAILS` |
| รหัสภารกิจ (เข้าภารกิจ) | Email | แท็บ `LOCKED EMAILS` |
| Login ด้วย LOGIN DATABASE (เปิดภารกิจใหม่, เปลี่ยนรหัสภารกิจ, ปิด/เปิดภารกิจ, ADMIN) รวมรหัสภารกิจตอนปิด/เปิดภารกิจ | Username และ Email | แท็บ `LOCKED USERS` และ `LOCKED EMAILS` |

Email ที่ถูกพักหรือบล็อกเข้าเว็บไซต์ไม่ได้ Username ที่ถูกพักหรือบล็อก Login ไม่ได้จากทุกอีเมล

## ไฟล์ Google Sheet ที่ใช้

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| Seat Plan A340 TEMPORARY FOR PASSENGER | แท็บ `รายการภารกิจ` + แท็บละ 1 ภารกิจ (ข้อมูลภารกิจ A3:B11, CREW ZONE B13:B14, รายชื่อจากแถว 19, ประวัติจากคอลัมน์ M) |
| Seat Plan 340 (For Admin) | สภาพที่นั่ง จอ และ NOTE (อ่านอย่างเดียว) |
| LOGIN DATABASE | ตรวจ Username / Password / เลขบัตร / วันเกิด (อ่านอย่างเดียว) |
| Passenger Seat Plan A340 User Page | ประวัติผู้ใช้: แท็บ `หน้าแรก` และแท็บละภารกิจ |
| Passenger Seat Plan A340 Admin Page | `HISTORY LOGIN DATA`, `ADMIN ACTIVITY`, `LOCKED USERS` (Username), `LOCKED EMAILS` (อีเมลที่ใส่รหัสเว็บไซต์ผิด) — ปลดบล็อกโดยแก้ช่องสถานะเป็น `ACTIVE` |

## ติดตั้ง / อัปเดตระบบหลังบ้าน

> Repo นี้เป็น public **ห้ามใส่รหัสผ่าน หรือรหัสไฟล์ Google Sheet ลงในไฟล์ใดของ repo** ค่าเหล่านี้กรอกในหน้า Apps Script เท่านั้น

1. เปิดไฟล์ **Seat Plan A340 TEMPORARY FOR PASSENGER** → **ส่วนขยาย › Apps Script**
2. ลบโค้ดเดิม วางโค้ดจาก [`apps-script/Code.gs`](apps-script/Code.gs) แล้วกรอกส่วน `SETUP` ด้านบน (รหัสเข้าใช้งาน, ลิงก์ไฟล์ทั้ง 4, Google Client ID ถ้ามี)
3. เลือกฟังก์ชัน `setup` → **เรียกใช้** → อนุญาตสิทธิ์ ดูผลในบันทึกการดำเนินการ (ระบบสร้างแท็บประวัติให้เอง) เสร็จแล้วลบค่าใน `SETUP` ออกได้
4. **ทำให้ใช้งานได้ › จัดการการทำให้ใช้งานได้ › แก้ไข (ดินสอ) › เวอร์ชัน: เวอร์ชันใหม่ › ทำให้ใช้งานได้** (URL เดิมใช้ต่อได้ ไม่ต้องแก้ `config.js`)
   ติดตั้งครั้งแรก: **การทำให้ใช้งานได้รายการใหม่** → เว็บแอป · ดำเนินการในฐานะ **ฉัน** · ผู้มีสิทธิ์เข้าถึง **ทุกคน** แล้วใส่ URL `/exec` ใน `config.js`

### Sign in with Google (เก็บอีเมลผู้ใช้)

1. https://console.cloud.google.com/ → สร้างหรือเลือกโปรเจกต์ → **APIs & Services › OAuth consent screen** ตั้งค่าแบบ External
2. **Credentials › Create credentials › OAuth client ID** → ประเภท **Web application**
3. **Authorized JavaScript origins** ใส่ `https://rtaf602.github.io`
4. คัดลอก Client ID (ลงท้าย `.apps.googleusercontent.com`) ใส่ `SETUP.googleClientId` แล้วรัน `setup` อีกครั้ง

ยังไม่ใส่ Client ID ก็ใช้งานได้ แต่ประวัติจะไม่มีอีเมล

## ไฟล์

- `index.html`, `app.css`, `app.js` — หน้าเว็บ
- `boardingpass.js`, `boardingpass.css`, `emblem.png` — Boarding Pass
- `config.js` — URL ของ Apps Script
- `apps-script/Code.gs` — ระบบหลังบ้าน (วางใน Apps Script)
