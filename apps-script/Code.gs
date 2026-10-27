/**
 * Seat Plan A340 TEMPORARY FOR PASSENGER — Apps Script (ระบบหลังบ้าน)
 *
 * วางโค้ดนี้ใน Apps Script ของไฟล์ "Seat Plan A340 TEMPORARY FOR PASSENGER" แล้วทำตาม README.md
 *  - แท็บ "รายการภารกิจ" = สารบัญภารกิจ (รหัสภารกิจเก็บที่นี่ แบบอ่านได้)
 *  - 1 Sector = 1 ภารกิจ = 1 แท็บ : ข้อมูลภารกิจ + รายชื่อรายที่นั่ง (ผู้โดยสาร / ลูกเรือ) + ประวัติการบันทึก (คอลัมน์ M)
 *  - สภาพที่นั่ง จอ Monitor และ NOTE อ่านสดจากไฟล์ "Seat Plan 340 (For Admin)"
 *  - ตรวจ Username / Password / เลขบัตรข้าราชการ / วันเกิด จากไฟล์ "LOGIN DATABASE" (PBKDF2-HMAC-SHA256)
 *  - ประวัติผู้ใช้ทั่วไป → "Passenger Seat Plan A340 User Page"  ประวัติ Login และ ADMIN → "Passenger Seat Plan A340 Admin Page"
 *
 * ทุกการตรวจรหัสทำที่นี่ หน้าเว็บได้รับแค่ผ่าน / ไม่ผ่าน และ token ที่ลงลายมือชื่อแล้ว
 * repo เป็น public: ห้ามใส่รหัสผ่านหรือรหัสไฟล์ลงในไฟล์ที่อยู่ใน GitHub ให้กรอกในส่วน SETUP ในหน้า Apps Script เท่านั้น
 */

// ---------- กรอกในหน้า Apps Script แล้วรัน setup() หนึ่งครั้ง (ค่าจะถูกเก็บใน Script Properties) ----------
const SETUP = {
  accessPin: '',        // รหัสเข้าหน้ารายการภารกิจ
  googleClientId: '',   // OAuth Client ID ของปุ่ม Sign in with Google (เว้นว่าง = ยังไม่บังคับ Sign in)
  adminSeatSheet: '',   // ลิงก์หรือรหัสไฟล์ Seat Plan 340 (For Admin)
  loginDatabase: '',    // ลิงก์หรือรหัสไฟล์ LOGIN DATABASE
  userLogSheet: '',     // ลิงก์หรือรหัสไฟล์ Passenger Seat Plan A340 User Page
  adminLogSheet: ''     // ลิงก์หรือรหัสไฟล์ Passenger Seat Plan A340 Admin Page
};

const PROP = { pin: 'ACCESS_PIN', cid: 'GOOGLE_CLIENT_ID', seat: 'ADMIN_SEAT_SHEET_ID', db: 'LOGIN_DB_ID', ulog: 'USER_LOG_ID', alog: 'ADMIN_LOG_ID', secret: 'SECRET' };
const OPT = {
  tz: 'Asia/Bangkok',
  // บัตรผ่านทุกใบ (เว็บไซต์ ภารกิจ ADMIN ดูภารกิจที่เสร็จสิ้น) ใช้นาฬิกาเดียวกัน: 90 นาทีนับจากเข้าเว็บไซต์ กด "ใช้งานต่อ" ได้ทีละ 90 นาที
  // รีเฟรชหน้าเว็บแล้วบัตรผ่านยังอยู่ (เก็บในแท็บนั้น) ปิดแท็บแล้วหาย
  clockMinutes: 90,
  // Email และ Username ใช้ได้ทีละ 1 หน้าต่าง: หน้าต่างถามระบบทุก 10 วินาที ไม่ได้ถามเกิน 30 วินาทีถือว่าปิดไปแล้ว
  // มีคนขอเข้าซ้อน: หน้าต่างเดิมเห็นข้อความแล้วมีเวลากด "ไม่อนุญาต" 10 วินาที
  hbStaleSec: 30, denySec: 10, reqStaleSec: 12,
  // กติกาเดียวกันทุกรหัส (รหัสเว็บไซต์, รหัสภารกิจ, Login): ผิดติดกัน 5 ครั้ง พัก 60 นาที · ผิดอีก 5 ครั้ง บล็อกจนแอดมินแก้สถานะเป็น ACTIVE
  //   นับต่อ Email ในแท็บ LOCKED EMAILS และต่อ Username ในแท็บ LOCKED USERS (ไฟล์ Admin Page) · งานที่ใช้ทั้งสองอย่างนับทั้งคู่
  maxFails: 5, pauseMinutes: 60,
  minMissionPw: 4,
  loginTab: 'DATABASE LOGIN',
  roles: ['Admin', 'Editor', 'Viewer']
};
const MSG = {
  login: 'ข้อมูลไม่ถูกต้อง หรือบัญชียังไม่พร้อมใช้งาน ให้ติดต่อ Admin',
  pin: 'รหัสผ่านไม่ถูกต้อง',
  locked: 'ใส่ข้อมูลผิดหลายครั้ง ให้รอ ' + OPT.pauseMinutes + ' นาทีแล้วลองใหม่',
  blocked: 'บัญชี Google นี้ใส่ข้อมูลผิดหลายครั้งและถูกบล็อก ให้ติดต่อ Admin',
  mpw: 'รหัสภารกิจไม่ถูกต้อง',
  session: 'หมดเวลาใช้งาน ให้เข้าสู่ระบบใหม่',
  mission: 'ต้องใส่รหัสภารกิจใหม่',
  admin: 'หมดเวลาของหน้า ADMIN ให้ Login ใหม่',
  google: 'ต้อง Sign in with Google ก่อนเข้าใช้งาน',
  closed: 'ภารกิจนี้ปิดแล้ว ดูได้อย่างเดียว ถ้าต้องการแก้ไขให้เปิดภารกิจอีกครั้ง',
  busy: 'ระบบกำลังบันทึกจากเครื่องอื่น ลองอีกครั้งใน 2-3 วินาที',
  blockedOut: 'Account ของคุณถูกบล็อก โปรดติดต่อ Admin เพื่อปลดบล็อก',
  kickedE: 'มีการเข้าใช้งานด้วยบัญชี Google นี้จากเครื่องอื่น คุณจึงถูกออกจากระบบ ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่าน Gmail และออกจากระบบ Google ทุกอุปกรณ์ แล้วติดต่อ Admin',
  kickedU: 'มีการ Login ด้วย Username นี้จากเครื่องอื่น คุณจึงถูกออกจากระบบ ถ้าไม่ใช่คุณ ให้ติดต่อ Admin',
  pwChanged: 'Password ของ Username นี้ถูกเปลี่ยน ให้ Login ใหม่',
  takeoverBusy: 'มีเครื่องอื่นกำลังขอเข้าใช้งานบัญชีนี้อยู่ ให้รอสักครู่แล้วลองใหม่',
  takeoverWait: 'กำลังรอเครื่องเดิมออกจากระบบ',
  deniedE: 'บัญชี Google นี้กำลังถูกใช้งานที่เครื่องอื่น และเครื่องนั้นไม่อนุญาตให้เข้าใช้งานซ้อน ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่าน Gmail และออกจากระบบ Google ทุกอุปกรณ์',
  deniedU: 'บัญชีนี้กำลังถูกใช้งานที่เครื่องอื่น และเครื่องนั้นไม่อนุญาตให้เข้าใช้งานซ้อน ถ้าไม่ใช่ตัวเองให้ติดต่อ Admin',
  ticket: 'หมดเวลารอ ให้เข้าสู่ระบบใหม่'
};

const ADMIN_MAP_SHEET = 'ผังที่นั่ง', ADMIN_FIRST_ROW = 17;
const SEAT_TXT = ['ปกติ', 'ขัดข้อง-ใช้ได้', 'ใช้ไม่ได้'];
const MON_TXT = ['จอปกติ', 'จอเสื่อม', 'จอเสีย'];

const INDEX_SHEET = 'รายการภารกิจ';
const INDEX_HEAD = ['ID', 'ชื่อแท็บ', 'ชื่อภารกิจ', 'เที่ยวบินที่', 'เส้นทางบิน', 'วันที่บิน', 'ผู้โดยสาร', 'สร้างเมื่อ', 'แก้ไขล่าสุด', 'ผู้บันทึกล่าสุด',
  'Sector', 'สถานะ', 'รหัสภารกิจ', 'ปิด / เปิดล่าสุด', 'แท็บประวัติ (User Page)'];
const IX = { id: 0, tab: 1, name: 2, flight: 3, route: 4, date: 5, pax: 6, created: 7, updated: 8, by: 9, sectorNo: 10, status: 11, pw: 12, closeInfo: 13, ulog: 14 };

// แท็บภารกิจ (รุ่น 2)
const INFO = [ // [key, ป้าย, แถว]
  ['aircraft', 'ประเภทเครื่องบิน', 3],
  ['sectorNo', 'Sector', 4],
  ['name', 'ชื่อภารกิจ', 5],
  ['flight', 'เที่ยวบินที่', 6],
  ['route', 'เส้นทางบิน (IATA CODE)', 7],
  ['date', 'วันที่บิน', 8],
  ['gate', 'GATE', 9],
  ['time', 'BOARDING TIME', 10],
  ['note', 'หมายเหตุ Boarding Pass', 11]
];
const CREW_FRONT_ROW = 13, CREW_REAR_ROW = 14, LAST_SAVE_ROW = 15, VERSION_ROW = 16;
const PAX_HEAD_ROW = 18, PAX_FIRST_ROW = 19;
const PAX_HEAD = ['ที่นั่ง', 'โซน', 'ประเภท', 'ยศ (ไทย)', 'ชื่อ (ไทย)', 'สกุล (ไทย)', 'RANK (EN)', 'FIRST NAME (EN)', 'LAST NAME (EN)', 'ผู้บันทึก', 'เวลาบันทึก'];
const PF = ['rt', 'ft', 'lt', 're', 'fe', 'le'];          // ช่องของคนหนึ่งคน (คอลัมน์ D-I)
const TYPE_PAX = 'ผู้โดยสาร', TYPE_CREW = 'ลูกเรือ';
const LOG_COL = 13; // M
const LOG_HEAD = ['เวลา', 'Email', 'ผู้บันทึก', 'ประเภท', 'ที่นั่ง / ช่อง', 'ค่าเดิม', 'ค่าใหม่'];
const LOG_FIRST_ROW = 3;

// ไฟล์ประวัติ
const UL_HOME = 'หน้าแรก', UL_HEAD = ['Timestamp', 'Email', 'ผู้บันทึก', 'Action', 'Detail'];
const UL_HOME_HEAD = UL_HEAD.concat(['ภารกิจที่เปิดอยู่ ณ ขณะนั้น']);   // แท็บหน้าแรกมีคอลัมน์ F เพิ่ม
const AL_LOGIN = 'HISTORY LOGIN DATA', AL_LOGIN_HEAD = ['Timestamp', 'Email', 'Username', 'Event', 'ใช้สำหรับ', 'ภารกิจ', 'รายละเอียด'];
const AL_ACT = 'ADMIN ACTIVITY', AL_ACT_HEAD = ['Timestamp', 'Email', 'Username', 'ภารกิจ', 'Action', 'Detail'];
const AL_LOCK = 'LOCKED USERS', AL_LOCK_HEAD = ['Username', 'สถานะ', 'จำนวนครั้งที่ผิด', 'พักถึงเวลา', 'รอบ', 'อัปเดตล่าสุด', 'วิธีปลดบล็อก'];
const AL_PINLOCK = 'LOCKED EMAILS', AL_PINLOCK_HEAD = ['Email', 'สถานะ', 'จำนวนครั้งที่ผิด', 'พักถึงเวลา', 'รอบ', 'อัปเดตล่าสุด', 'วิธีปลดบล็อก'];
// ล็อก 2 แท็บใช้กติกาเดียวกัน (OPT.maxFails / OPT.pauseMinutes)
const LOCK_USER = { tab: AL_LOCK, head: AL_LOCK_HEAD, max: function () { return OPT.maxFails; }, pause: function () { return OPT.pauseMinutes; } };
const LOCK_EMAIL = { tab: AL_PINLOCK, head: AL_PINLOCK_HEAD, max: function () { return OPT.maxFails; }, pause: function () { return OPT.pauseMinutes; } };

// LOGIN DATABASE: หาคอลัมน์จากชื่อหัวคอลัมน์ (เหมือนระบบ eadmin)
const COL = { rank: 'ยศ', name: 'ชื่อ-สกุล', pos: 'ตำแหน่งงาน', idGov: 'ID Card ขรก.', idCit: 'ID Card ปชช.', birth: 'BIRTH DATE', role: 'Role', username: 'Username', salt: 'Salt', hash: 'hash', end: 'วันสิ้นสุดการใช้งาน' };
const BASE = ['name', 'pos', 'idGov', 'idCit', 'birth'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- ที่นั่งทั้งลำ (เรียงจากหัวไปท้าย) ----------
function seatList_() {
  const L = [['CC', 'MISSION COMMANDER', 'CC']];
  const add = function (rows, letters, zone) {
    rows.forEach(function (r) { letters.split('').forEach(function (c) { L.push([r + c, zone, String(r)]); }); });
  };
  add([1, 2], 'AEFK', 'FIRST CLASS');
  add([11, 12, 14, 15, 16], 'ABEFJK', 'BUSINESS CLASS');
  add([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41], 'ABDEFJK', 'PREMIUM ECONOMY');
  add([51, 52, 53], 'ABDEFGJK', 'ECONOMY');
  add([54, 55, 56], 'ABDEFJK', 'ECONOMY');
  add([57], 'ABJK', 'ECONOMY');
  return L; // 165 ที่นั่ง
}
const ROWS = ['CC', '1', '2', '11', '12', '14', '15', '16', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '51', '52', '53', '54', '55', '56', '57'];
const SEAT_ROW = (function () { const o = {}; seatList_().forEach(function (s) { o[s[0]] = s[2]; }); return o; })();
// CREW ZONE หัวเครื่อง (ค่าในช่อง B13):
//   ''      = ไม่กั้น
//   'CC'    = ห้อง Mission Commander เท่านั้น
//   'CC-16' = ห้อง Mission Commander ถึงแถว 16
//   '16'    = แถว 1 ถึงแถว 16 (ไม่รวมห้อง Mission Commander)
// ท้ายเครื่อง = แถวที่เลือกถึงแถวสุดท้าย
function crewFront_(v) {   // → { cc: รวมห้อง CC, end: ลำดับแถวสุดท้ายใน ROWS (CC = 0) } หรือ null ถ้าไม่กั้น / ค่าไม่ถูกต้อง
  v = String(v || '').trim().toUpperCase();
  if (!v) return null;
  if (v === 'CC') return { cc: true, end: 0 };
  const m = /^CC-(.+)$/.exec(v), i = ROWS.indexOf(m ? m[1] : v);
  return i > 0 ? { cc: !!m, end: i } : null;
}
function crewFrontTxt_(v) {
  const f = crewFront_(v);
  if (!f) return 'ไม่กั้น';
  if (!f.end) return 'ห้อง Mission Commander เท่านั้น';
  return (f.cc ? 'ห้อง Mission Commander ถึงแถว ' : 'แถว 1 ถึงแถว ') + ROWS[f.end];
}
function crewRows_(c) {
  const set = {}, f = crewFront_(c.front), ri = ROWS.indexOf(String(c.rear || ''));
  let i;
  if (f) for (i = f.cc ? 0 : 1; i <= f.end; i++) set[ROWS[i]] = 1;
  if (ri > 0) for (i = ri; i < ROWS.length; i++) set[ROWS[i]] = 1;
  return set;
}

// =====================================================================
// Web API (POST แบบ text/plain)
// =====================================================================
function doGet() { return json_({ ok: true, app: 'Seat Plan A340 Passenger API', api: API_VERSION }); }

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const ctx = { b: b, now: Date.now() };
  BLK_ = null; DBH_ = null;   // สำเนาต่อคำขอ (ของจริงอยู่ใน cache)
  try {
    const fn = ACTIONS[b && b.action];
    if (!fn) return json_({ ok: false, error: 'unknown_action' });
    return json_(fn(ctx, b));
  } catch (err) {
    if (err && err.code) return json_({ ok: false, error: err.code, message: err.message, extra: err.extra || null });
    console.error(err && err.stack ? err.stack : String(err));
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code, message, extra) { const e = new Error(message || code); e.code = code; e.extra = extra; return e; }

// รุ่นของระบบหลังบ้าน: หน้าเว็บเทียบกับรุ่นที่ต้องการ ถ้าไม่ตรงจะแจ้งให้วางโค้ด Code.gs ล่าสุดและ Deploy ใหม่
const API_VERSION = 3;
const ACTIONS = {
  config: function () { return { ok: true, googleClientId: prop_(PROP.cid) || '', pinRequired: true, api: API_VERSION }; },
  enter: opEnter_,
  missions: opMissions_,
  create: opCreate_,
  open: opOpen_,
  load: opLoad_,
  save: opSave_,
  log: opLog_,
  'mpw.change': opMpwChange_,
  'mission.close': opClose_,
  'mission.reopen': opReopen_,
  'admin.login': opAdminLogin_,
  'admin.logout': opAdminLogout_,
  'admin.save': opAdminSave_,
  'missions.unlock': opMissionsUnlock_,
  ping: opPing_,
  extend: opExtend_,
  logout: opLogout_,
  bye: opBye_,
  'takeover.poll': opTakeoverPoll_,
  'takeover.deny': opTakeoverDeny_
};

// ---------- Script Properties ----------
let PROPS_ = null;
// ค่าตั้งระบบเก็บสำเนาใน cache 10 นาที (หน้าเว็บถามระบบทุก 10 วินาที จึงไม่อ่าน Script Properties ทุกครั้ง) · รัน setup() แล้วล้างให้เอง
function props_() {
  if (!PROPS_) {
    let c = null;
    try { c = CacheService.getScriptCache().get('cfg1'); } catch (e) { c = null; }
    if (c) { try { PROPS_ = JSON.parse(c); } catch (e) { PROPS_ = null; } }
    if (!PROPS_) {
      PROPS_ = PropertiesService.getScriptProperties().getProperties();
      try { CacheService.getScriptCache().put('cfg1', JSON.stringify(PROPS_), 600); } catch (e) { /* ไม่เป็นไร */ }
    }
  }
  return PROPS_;
}
function prop_(k) { return String(props_()[k] || ''); }
function fileId_(v) { const s = str_(v), m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(s); return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(s) ? s : ''); }

// ---------- tokens ----------
function secret_() { const s = prop_(PROP.secret); if (!s) throw err_('config', 'ยังไม่ได้รัน setup() ใน Apps Script'); return utf8_(s); }
function sign_(o) { const body = Utilities.base64EncodeWebSafe(utf8_(JSON.stringify(o))); return body + '.' + hex_(hmac_(utf8_(body), secret_())).slice(0, 40); }
function unsign_(t, kind, now) {
  t = String(t || ''); const i = t.lastIndexOf('.');
  if (i < 1 || t.length > 2000) return null;
  const body = t.slice(0, i);
  if (!same_(t.slice(i + 1), hex_(hmac_(utf8_(body), secret_())).slice(0, 40))) return null;
  let o; try { o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString()); } catch (e) { return null; }
  if (!o || o.k !== kind || !(o.x > now)) return null;
  return o;
}
function session_(ctx) {
  const s = unsign_(ctx.b.s, 's', ctx.now);
  if (!s || !s.w || s.w !== wid_(ctx.b)) throw err_('session', MSG.session);
  ctx.email = s.e || ''; ctx.sx = s.x; ctx.w = s.w;
  if (ctx.email) {
    if (blocked_().e[ctx.email]) throw err_('blocked_out', MSG.blockedOut);
    const k = ownKey_('e', ctx.email), o = cget_(k);
    if (o && o.w !== s.w) throw err_('kicked', MSG.kickedE);
    if (!o) cput_(k, { w: s.w, at: ctx.now });
  }
  return s;
}
function pwTag_(pw) { return hex_(sha256_(utf8_('mpw|' + pw))).slice(0, 12); }
function missionAuth_(ctx, ix) {
  const t = unsign_(ctx.b.mt, 'm', ctx.now);
  if (!t || t.m !== ix.id || t.v !== pwTag_(ix.pw)) throw err_('mission_token', MSG.mission);
  return t;
}
function adminAuth_(ctx, ix) {
  const t = unsign_(ctx.b.at, 'a', ctx.now);
  if (!t || t.m !== ix.id || t.w !== ctx.w) throw err_('admin_token', MSG.admin);
  const why = userGone_(ctx, t);
  if (why) throw err_('admin_token', why);
  ctx.admin = t.u; return t;
}

// =====================================================================
// เข้าใช้งาน (รหัสเข้าใช้งาน + Sign in with Google)
// =====================================================================
function opEnter_(ctx, b) {
  const cid = prop_(PROP.cid);
  let email = '';
  if (cid) {
    email = googleEmail_(String(b.credential || ''), cid);
    if (!email) throw err_('google', MSG.google);
  }
  ctx.email = email;
  const pin = prop_(PROP.pin);
  if (!pin) throw err_('config', 'ยังไม่ได้ตั้งรหัสเข้าใช้งาน (accessPin) ใน setup()');
  const ok = same_(String(b.pin || ''), pin);
  emailAttempt_(ctx, null, ok, 'ใส่รหัสเข้าใช้งาน', 'pin:all');
  if (!ok) { Utilities.sleep(400); throw err_('pin', MSG.pin); }
  const w = wid_(b);
  if (!w) throw err_('bad_request', 'หน้าเว็บรุ่นเก่า ให้กด Ctrl+F5 แล้วลองใหม่');
  if (blocked_().e[email]) throw err_('blocked', MSG.blocked);
  return loginOrWait_(ctx, { act: 'enter', w: w, e: email });
}
// ตรวจ ID token ของ Google ที่ Google เอง แล้วคืนอีเมล
function googleEmail_(credential, cid) {
  if (!/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(credential)) return '';
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return '';
  let t; try { t = JSON.parse(r.getContentText()); } catch (e) { return ''; }
  if (t.aud !== cid || !/^(https:\/\/)?accounts\.google\.com$/.test(String(t.iss)) || String(t.email_verified) !== 'true' || !(Number(t.exp) * 1000 > Date.now())) return '';
  return String(t.email || '').toLowerCase();
}

// =====================================================================
// การเข้าใช้งานต่อหน้าต่าง
//  - หน้าเว็บแต่ละแท็บมีรหัสหน้าต่าง (w) ของตัวเอง ส่งมากับทุกคำขอ บัตรผ่านทุกใบผูกกับหน้าต่างนั้น
//  - Email (Sign in with Google) และ Username (หน้า ADMIN / ดูภารกิจที่เสร็จสิ้น) ใช้ได้ทีละ 1 หน้าต่าง
//    ถ้ามีคนเข้าซ้อน: หน้าต่างเดิมเห็นข้อความภายในรอบถามถัดไป มีเวลากด "ไม่อนุญาต" 10 วินาที
//    ไม่กด → หน้าต่างใหม่ได้เข้า หน้าต่างเดิมถูกออก · หน้าต่างเดิมปิดไปแล้ว / ไม่ได้ถามระบบเกิน 30 วินาที → เข้าได้เลย
//  - ข้อมูลเหล่านี้อยู่ใน CacheService (ไม่มีโควตารายวันเหมือน Script Properties) ระบบหลังบ้านตัดสินทั้งหมด
// =====================================================================
let BLK_ = null, DBH_ = null;
function wid_(b) { const w = String(b && b.w || ''); return /^[A-Za-z0-9_-]{12,64}$/.test(w) ? w : ''; }
function cget_(k) { try { const v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cput_(k, v, sec) { try { CacheService.getScriptCache().put(k, JSON.stringify(v), sec || 21600); } catch (e) { /* ไม่เป็นไร */ } }
function cdel_(k) { try { CacheService.getScriptCache().remove(k); } catch (e) { /* ไม่เป็นไร */ } }
function ownKey_(type, v) { return 'own:' + type + ':' + String(v || '').toLowerCase(); }
function alive_(w, now) {
  const hb = Number(cget_('hb:' + w)) || 0, bye = Number(cget_('bye:' + w)) || 0;
  return hb > 0 && now - hb <= OPT.hbStaleSec * 1000 && !(bye && bye >= hb);
}
function release_(key, w) { const o = cget_(key); if (o && o.w === w) cdel_(key); }
function hTag_(hash) { return hex_(sha256_(utf8_('h|' + String(hash || '')))).slice(0, 10); }
// Email / Username ที่ถูกบล็อก (สถานะ BLOCKED ในแท็บ LOCKED EMAILS / LOCKED USERS) อ่านใหม่ทุก 20 วินาที
function blocked_() {
  if (BLK_) return BLK_;
  let m = cget_('blk');
  if (!m) {
    m = { e: {}, u: {} };
    quietly_(function () {
      if (!prop_(PROP.alog)) return;
      [[LOCK_EMAIL, 'e'], [LOCK_USER, 'u']].forEach(function (x) {
        const sh = lockSheet_(x[0]), n = sh.getLastRow();
        if (n > 1) dv_(sh.getRange(2, 1, n - 1, 2)).forEach(function (r) { if (str_(r[1]).toUpperCase() === 'BLOCKED') m[x[1]][str_(r[0]).toLowerCase()] = 1; });
      });
    });
    cput_('blk', m, 20);
  }
  BLK_ = m; return m;
}
// ลายนิ้วมือของ Password ปัจจุบันใน LOGIN DATABASE (Password ถูกเปลี่ยน → บัตรผ่านที่ได้จาก Password เดิมใช้ไม่ได้) อ่านใหม่ทุก 60 วินาที
function dbTags_() {
  if (DBH_) return DBH_;
  let m = cget_('dbh');
  if (!m) {
    m = {};
    try { loginDb_().forEach(function (p) { if (p.username) m[p.username.toLowerCase()] = hTag_(p.hash); }); } catch (e) { m = null; }
    if (m) cput_('dbh', m, 60);
  }
  DBH_ = m || {}; return DBH_;
}
// บัตรผ่าน ADMIN / ดูภารกิจที่เสร็จสิ้น ยังใช้ได้ไหม: ถูกบล็อก / มีคนเข้า Username นี้จากหน้าต่างอื่น / Password ถูกเปลี่ยน
function userGone_(ctx, t) {
  const u = String(t.u || '').toLowerCase();
  if (blocked_().u[u]) return MSG.blockedOut;
  const k = ownKey_('u', u), o = cget_(k);
  if (o && o.w !== t.w) return MSG.kickedU;
  const tags = dbTags_();
  if (t.h && Object.keys(tags).length && tags[u] !== t.h) return MSG.pwChanged;   // Password เปลี่ยน หรือ Username ถูกลบ
  if (!o) cput_(k, { w: t.w, at: ctx.now });
  return '';
}
// ขอใช้ Email / Username ให้หน้าต่าง w: คืน null = ได้แล้ว หรือ {type, seen} = ต้องรอหน้าต่างเดิม
function claim_(ctx, req) {
  const now = ctx.now, keys = [];
  if (req.e) keys.push(['e', req.e]);
  if (req.u) keys.push(['u', req.u]);
  let wait = null;
  const take = [];
  keys.forEach(function (k) {
    const key = ownKey_(k[0], k[1]), o = cget_(key), tkKey = 'tk:' + key;
    if (!o || o.w === req.w || !alive_(o.w, now)) { take.push([key, o, k[0], 'หน้าต่างเดิมปิดไปแล้ว หรือไม่ได้ใช้งานเกิน ' + OPT.hbStaleSec + ' วินาที']); return; }
    let tk = cget_(tkKey);
    if (tk && tk.w !== req.w && tk.st === 'wait' && now - tk.poll <= OPT.reqStaleSec * 1000) throw err_('takeover_busy', MSG.takeoverBusy);
    if (tk && tk.w === req.w && tk.st === 'denied') { cdel_(tkKey); throw err_('takeover_denied', k[0] === 'e' ? MSG.deniedE : MSG.deniedU); }
    if (!tk || tk.w !== req.w || tk.owner !== o.w) {
      tk = { w: req.w, owner: o.w, at: now, poll: now, seen: 0, st: 'wait', type: k[0] };
      loginLog_(ctx, req.u || '', 'TAKEOVER_REQUEST', k[0] === 'e' ? 'Email ใช้ได้ทีละ 1 หน้าต่าง' : 'Username ใช้ได้ทีละ 1 หน้าต่าง', '', 'รอหน้าต่างเดิม (Login เมื่อ ' + fmtTime_(new Date(o.at || now)) + ')');
    }
    tk.poll = now;
    if (tk.seen && now >= tk.seen + OPT.denySec * 1000 + 1500) { take.push([key, o, k[0], 'หน้าต่างเดิมไม่กดไม่อนุญาตภายใน ' + OPT.denySec + ' วินาที จึงถูกออกจากระบบ']); return; }
    cput_(tkKey, tk, 300);
    if (!wait) wait = { type: k[0], seen: tk.seen, until: tk.seen ? tk.seen + OPT.denySec * 1000 : 0 };
  });
  if (wait) return wait;
  take.forEach(function (t) {
    if (t[1] && t[1].w !== req.w) loginLog_(ctx, req.u || '', 'TAKEOVER', t[2] === 'e' ? 'Email ใช้ได้ทีละ 1 หน้าต่าง' : 'Username ใช้ได้ทีละ 1 หน้าต่าง', '', t[3]);
    cput_(t[0], { w: req.w, at: now });
    cdel_('tk:' + t[0]);
  });
  cput_('hb:' + req.w, now, 600);
  return null;
}
// Login สำเร็จแล้ว: ได้ Email / Username → ออกบัตรผ่าน · ยังมีหน้าต่างเดิมใช้อยู่ → คืนตั๋วรอ (ใช้ถามซ้ำด้วย takeover.poll)
function loginOrWait_(ctx, req) {
  const run = function () {
    const wait = claim_(ctx, req);
    if (wait) return { ok: false, error: 'takeover_wait', message: MSG.takeoverWait, wait: wait,
      pt: sign_({ k: 'p', act: req.act, w: req.w, e: req.e || '', u: req.u || '', h: req.h || '', m: req.m || '', x: ctx.now + 180000 }) };
    return finishLogin_(ctx, req);
  };
  return req.act === 'enter' ? withLock_(run) : run();   // admin / view เรียกจากใน withLock_ อยู่แล้ว
}
function finishLogin_(ctx, req) {
  if (req.act === 'enter') {
    const x = ctx.now + OPT.clockMinutes * 60000;
    userLog_(ctx, null, req.e, '', 'เข้าใช้งาน', req.e ? 'Sign in with Google' : 'ไม่ได้ Sign in with Google');
    return { ok: true, s: sign_({ k: 's', e: req.e, w: req.w, x: x }), email: req.e, x: x, now: ctx.now };
  }
  if (req.act === 'view') {
    loginLog_(ctx, req.u, 'VIEW_LOGIN', 'ดูภารกิจที่เสร็จสิ้น / ภารกิจทั้งหมด', '', '');
    return { ok: true, vt: sign_({ k: 'v', u: req.u, e: ctx.email || '', w: req.w, h: req.h, x: ctx.sx }), x: ctx.sx };
  }
  const ix = indexRow_(SpreadsheetApp.getActive(), req.m);
  adminAct_(ctx, req.u, ix, 'เข้าหน้า ADMIN', '');
  return { ok: true, at: sign_({ k: 'a', u: req.u, m: req.m, e: ctx.email, w: req.w, h: req.h, x: ctx.sx }), user: req.u, x: ctx.sx };
}
function opTakeoverPoll_(ctx, b) {
  const t = unsign_(b.pt, 'p', ctx.now);
  if (!t || t.w !== wid_(b)) throw err_('ticket', MSG.ticket);
  if (t.act === 'enter') { ctx.email = t.e; ctx.sx = 0; }
  else { session_(ctx); if (t.e !== ctx.email) throw err_('ticket', MSG.ticket); }
  return withLock_(function () {
    if (t.act === 'admin') { const ix = indexRow_(SpreadsheetApp.getActive(), t.m); if (!ix) throw err_('no_mission', 'ไม่พบภารกิจนี้'); ctx.b.mt = b.mt; missionAuth_(ctx, ix); }
    const req = { act: t.act, w: t.w, e: t.e, u: t.u, h: t.h, m: t.m };
    const wait = claim_(ctx, req);
    if (wait) return { ok: false, error: 'takeover_wait', message: MSG.takeoverWait, wait: wait, pt: b.pt };
    return finishLogin_(ctx, req);
  });
}
// ทุกบัตรผ่านของหน้าต่างนี้ (เพื่อหาคำขอเข้าซ้อนที่ส่งมาถึงหน้าต่างนี้)
function myUsers_(ctx, b) {
  const out = {};
  [['at', 'a', 'admin'], ['vt', 'v', 'view']].forEach(function (x) {
    const t = unsign_(b[x[0]], x[1], ctx.now);
    if (!t || t.w !== ctx.w) return;
    const why = userGone_(ctx, t);
    out[x[2]] = why ? { why: why } : { u: String(t.u).toLowerCase() };
  });
  return out;
}
// หน้าเว็บถามทุก 10 วินาที: ยังใช้งานได้ไหม · มีคนขอเข้าซ้อนไหม · รหัสภารกิจถูกเปลี่ยนไหม · มีคน SAVE ภารกิจนี้ไหม
function opPing_(ctx, b) {
  const s = session_(ctx), now = ctx.now;
  cput_('hb:' + s.w, now, 600);
  if (ctx.email) cput_(ownKey_('e', ctx.email), { w: s.w, at: (cget_(ownKey_('e', ctx.email)) || {}).at || now });
  const out = { ok: true, x: s.x, now: now };
  const users = myUsers_(ctx, b), keys = [];
  if (ctx.email) keys.push(ownKey_('e', ctx.email));
  ['admin', 'view'].forEach(function (k) { if (!users[k]) return; if (users[k].why) out[k + 'Gone'] = users[k].why; else keys.push(ownKey_('u', users[k].u)); });
  for (let i = 0; i < keys.length; i++) {
    const tk = cget_('tk:' + keys[i]);
    if (!tk || tk.owner !== s.w || tk.st !== 'wait' || now - tk.poll > OPT.reqStaleSec * 1000) continue;
    if (!tk.seen) { tk.seen = now; cput_('tk:' + keys[i], tk, 300); }
    out.takeover = { type: tk.type, left: Math.max(0, tk.seen + OPT.denySec * 1000 - now) };
    break;
  }
  if (b.id) {
    try {
      const ss = SpreadsheetApp.getActive();
      let tag = cget_('mp:' + b.id), ls = cget_('ls:' + b.id);
      let ix = null;
      if (tag === null) { ix = indexRow_(ss, b.id); if (ix) { tag = pwTag_(ix.pw); cput_('mp:' + b.id, tag, 60); } }
      const t = unsign_(b.mt, 'm', now);
      if (tag !== null && (!t || t.m !== String(b.id) || t.v !== tag)) out.mpw = true;
      if (ls === null) {
        ix = ix || indexRow_(ss, b.id);
        const sh = ix ? sheetById_(ss, ix.id) : null;
        if (sh) { const v = sh.getRange(LAST_SAVE_ROW, 2).getDisplayValue(); try { ls = v ? JSON.parse(v) : {}; } catch (e) { ls = {}; } cput_('ls:' + b.id, ls, 600); }
      }
      if (ls) out.lastSave = ls.at ? ls : null;
    } catch (e) { /* ไม่ใช่เรื่องสำคัญ ถามรอบหน้า */ }
  }
  return out;
}
// หน้าต่างเดิมกด "ไม่อนุญาต ฉันกำลังใช้งานอยู่"
function opTakeoverDeny_(ctx, b) {
  const s = session_(ctx), users = myUsers_(ctx, b), keys = [];
  if (ctx.email) keys.push(ownKey_('e', ctx.email));
  ['admin', 'view'].forEach(function (k) { if (users[k] && users[k].u) keys.push(ownKey_('u', users[k].u)); });
  return withLock_(function () {
    let n = 0;
    keys.forEach(function (key) {
      const tk = cget_('tk:' + key);
      if (!tk || tk.owner !== s.w || tk.st !== 'wait') return;
      tk.st = 'denied'; cput_('tk:' + key, tk, 300); n++;
      loginLog_(ctx, key.indexOf('own:u:') === 0 ? key.slice(6) : '', 'TAKEOVER_DENIED', tk.type === 'e' ? 'Email ใช้ได้ทีละ 1 หน้าต่าง' : 'Username ใช้ได้ทีละ 1 หน้าต่าง', '', 'หน้าต่างเดิมไม่อนุญาต');
    });
    return { ok: true, denied: n };
  });
}
// ใช้งานต่อ: ต่อจากเวลาหมดเดิมไปอีก 90 นาที ทุกบัตรผ่านของหน้าต่างนี้
function opExtend_(ctx, b) {
  const s = session_(ctx), x = s.x + OPT.clockMinutes * 60000;
  const re = function (t, kind) { const o = unsign_(t, kind, ctx.now); if (!o) return undefined; o.x = x; return sign_(o); };
  const mts = {};
  Object.keys(b.mts || {}).slice(0, 50).forEach(function (id) { const v = re(b.mts[id], 'm'); if (v) mts[id] = v; });
  const out = { ok: true, x: x, now: ctx.now, s: re(b.s, 's'), mts: mts };
  const at = unsign_(b.at, 'a', ctx.now); if (at && at.w === s.w) out.at = re(b.at, 'a');
  const vt = unsign_(b.vt, 'v', ctx.now); if (vt && vt.w === s.w) out.vt = re(b.vt, 'v');
  userLog_(ctx, null, ctx.email, '', 'ใช้งานต่อ', 'ใช้ได้ถึง ' + fmtTime_(new Date(x)));
  return out;
}
// ออกจากระบบ (ปุ่ม Logout): คืน Email / Username ให้ใช้ที่หน้าต่างอื่นได้ทันที
function opLogout_(ctx, b) {
  const s = unsign_(b.s, 's', ctx.now);
  if (!s || s.w !== wid_(b)) return { ok: true };
  ctx.email = s.e || ''; ctx.w = s.w;
  const users = [];
  [['at', 'a'], ['vt', 'v']].forEach(function (x) { const t = unsign_(b[x[0]], x[1], ctx.now); if (t && t.w === s.w) users.push(String(t.u).toLowerCase()); });
  if (s.e) release_(ownKey_('e', s.e), s.w);
  users.forEach(function (u) { release_(ownKey_('u', u), s.w); loginLog_(ctx, u, 'LOGOUT', 'ออกจากระบบ', '', clean_(b.why, 80)); });
  cdel_('hb:' + s.w);
  userLog_(ctx, null, s.e, '', 'ออกจากระบบ', clean_(b.why, 80) || 'กด Logout');
  return { ok: true };
}
// หน้าเว็บกำลังปิด / รีเฟรช (sendBeacon): ถ้าไม่กลับมาถามระบบอีก ถือว่าหน้าต่างนี้ปิดแล้ว ให้หน้าต่างอื่นเข้าได้ทันที
function opBye_(ctx, b) {
  const s = unsign_(b.s, 's', ctx.now);
  if (s && s.w === wid_(b)) cput_('bye:' + s.w, ctx.now, 600);
  return { ok: true };
}

// =====================================================================
// รายการภารกิจ
// =====================================================================
function indexSheet_(ss) {
  let sh = ss.getSheetByName(INDEX_SHEET);
  if (!sh) {
    const first = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && first.getLastRow() === 0) { sh = first; sh.setName(INDEX_SHEET); }
    else sh = ss.insertSheet(INDEX_SHEET, 0);
  }
  const head = sh.getRange(1, 1, 1, INDEX_HEAD.length).getDisplayValues()[0];
  if (head.join('|') !== INDEX_HEAD.join('|')) {
    sh.getRange('A:O').setNumberFormat('@');
    sh.getRange(1, 1, 1, INDEX_HEAD.length).setValues([INDEX_HEAD]).setFontWeight('bold').setBackground('#dfeaf5');
    sh.setFrozenRows(1);
    // ภารกิจเดิมก่อนรุ่นนี้: เปิดอยู่ ยังไม่มีรหัสภารกิจ (ต้องตั้งผ่านปุ่มเปลี่ยนรหัสภารกิจ)
    const n = sh.getLastRow();
    if (n > 1) {
      const st = sh.getRange(2, IX.status + 1, n - 1, 1).getDisplayValues();
      st.forEach(function (r, i) { if (!r[0] && sh.getRange(i + 2, 1).getDisplayValue()) sh.getRange(i + 2, IX.status + 1).setValue('OPEN'); });
    }
  }
  return sh;
}
function sheetById_(ss, id) {
  id = Number(id);
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (all[i].getSheetId() === id) return all[i];
  return null;
}
function readIndex_(ss) {
  const ix = indexSheet_(ss), n = ix.getLastRow(), out = [];
  if (n > 1) {
    dv_(ix.getRange(2, 1, n - 1, INDEX_HEAD.length)).forEach(function (r, i) {
      if (!r[0]) return;
      const o = { row: i + 2 }; Object.keys(IX).forEach(function (k) { o[k] = String(r[IX[k]] || ''); });
      o.status = o.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
      out.push(o);
    });
  }
  return { sh: ix, rows: out };
}
function indexRow_(ss, id) {
  const all = readIndex_(ss).rows;
  for (let i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}
function setIndex_(ss, row, obj) {
  const ix = indexSheet_(ss);
  Object.keys(obj).forEach(function (k) { ix.getRange(row, IX[k] + 1).setValue(safe_(obj[k])); });
}
function missionCtx_(ctx, ss, id) {
  const ix = indexRow_(ss, id);
  const sh = ix ? sheetById_(ss, ix.id) : null;
  if (!ix || !sh) throw err_('no_mission', 'ไม่พบภารกิจนี้ (แท็บอาจถูกลบ)');
  ctx.mission = ix;
  return { ix: ix, sh: sh };
}
function missionLabel_(ix) { return [ix.flight, ix.sectorNo ? 'S' + ix.sectorNo : '', ix.date].filter(String).join(' ') || ix.tab; }

// ภารกิจที่ปิดแล้วส่งให้เฉพาะคนที่ Login ดูภารกิจที่เสร็จสิ้น / ทั้งหมด (token 'v') ผู้ใช้ทั่วไปได้เฉพาะภารกิจที่เปิดอยู่
function viewAuth_(ctx, b) {
  const t = unsign_(b.vt, 'v', ctx.now);
  if (!t || t.e !== (ctx.email || '') || t.w !== ctx.w) return false;
  const why = userGone_(ctx, t);
  if (why) { ctx.viewWhy = why; return false; }
  return true;
}
function opMissionsUnlock_(ctx, b) {
  session_(ctx);
  return withLock_(function () {
    const p = credCheck_(ctx, b.cred, 'ดูภารกิจที่เสร็จสิ้น / ภารกิจทั้งหมด', null);
    return loginOrWait_(ctx, { act: 'view', w: ctx.w, e: ctx.email, u: p.username.toLowerCase(), h: hTag_(p.hash) });
  });
}
function opMissions_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const canView = viewAuth_(ctx, b);
  const all = readIndex_(ss).rows.filter(function (r) { return !!sheetById_(ss, r.id); });
  const out = all.filter(function (r) { return canView || r.status !== 'CLOSED'; }).map(function (r) {
    return { id: r.id, tab: r.tab, name: r.name, flight: r.flight, sectorNo: r.sectorNo, route: r.route, date: r.date, pax: Number(r.pax) || 0,
      created: r.created, updated: r.updated, by: r.by, status: r.status, hasPw: !!r.pw, closeInfo: r.closeInfo };
  });
  if (b.first) {
    const open = out.filter(function (m) { return m.status !== 'CLOSED'; });
    const names = open.map(function (m, i) {
      return (i + 1) + '. ' + [m.flight, m.sectorNo ? 'Sector ' + m.sectorNo : '', m.route, m.date].filter(String).join(' · ') + (m.name ? ' — ' + m.name : '');
    }).join('\n');
    userLog_(ctx, null, ctx.email, '', 'เปิดหน้ารายการภารกิจ', 'เปิดอยู่ ' + open.length + ' ภารกิจ (ทั้งหมด ' + all.length + ')', names || '-');
  }
  return { ok: true, missions: out.reverse(), canView: canView, viewWhy: ctx.viewWhy || '' };
}

function opCreate_(ctx, b) {
  session_(ctx);
  const by = clean_(b.by, 60);
  const info = b.info || {}, pw = String(b.mpw || '');
  if (pw.length < OPT.minMissionPw || pw.length > 60) throw err_('bad_request', 'รหัสภารกิจต้องมีอย่างน้อย ' + OPT.minMissionPw + ' ตัว');
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const p = credCheck_(ctx, b.cred, 'เปิดภารกิจใหม่', null);   // ต้อง Login ด้วย LOGIN DATABASE เหมือนหน้า ADMIN
    // กดซ้ำ / เน็ตหลุดแล้วกดใหม่ด้วยฟอร์มเดิม (รหัสคำขอเดิม) → คืนภารกิจที่สร้างไปแล้ว ไม่สร้างแท็บซ้ำ
    const rid = /^[A-Za-z0-9-]{8,64}$/.test(String(b.rid || '')) ? 'create:' + b.rid : '';
    const done = rid ? CacheService.getScriptCache().get(rid) : null;
    if (done && sheetById_(ss, done)) {
      const r0 = indexRow_(ss, done);
      if (r0) return { ok: true, id: done, again: true, mt: sign_({ k: 'm', m: done, e: ctx.email, v: pwTag_(r0.pw), x: ctx.sx }) };
    }
    const ix = indexSheet_(ss);
    const v = {};
    INFO.forEach(function (f) { if (f[0] !== 'aircraft') v[f[0]] = normInfo_(f[0], info[f[0]]); });
    const title = uniqueTitle_(ss, tabTitle_(v.flight, v.sectorNo, v.date, 'ภารกิจใหม่ ' + Utilities.formatDate(new Date(ctx.now), OPT.tz, 'yyMMdd-HHmm')), null);
    const sh = ss.insertSheet(title, ss.getSheets().length);
    setupMissionSheet_(sh);
    INFO.forEach(function (f) { if (f[0] !== 'aircraft' && v[f[0]]) sh.getRange(f[2], 2).setValue(safe_(v[f[0]])); });
    const nowTxt = fmtTime_(new Date(ctx.now)), id = String(sh.getSheetId());
    const row = [id, title, v.name, v.flight, v.route, v.date, '0', nowTxt, nowTxt, by || ctx.email, v.sectorNo, 'OPEN', pw, '', ''];
    ix.appendRow(row.map(safe_));
    const rec = indexRow_(ss, id);
    const detail = [v.flight, v.sectorNo ? 'Sector ' + v.sectorNo : '', v.route, v.date, v.name].filter(String).join(' · ');
    appendLog_(sh, [[nowTxt, ctx.email, by, 'เปิดภารกิจ', title, '', detail]]);
    userLog_(ctx, null, ctx.email, by, 'เปิดภารกิจใหม่', title + ' · ' + detail);
    userLog_(ctx, rec, ctx.email, by, 'เปิดภารกิจ', detail);
    adminAct_(ctx, p.username, rec, 'เปิดภารกิจใหม่', detail);
    if (rid) { try { CacheService.getScriptCache().put(rid, id, 1800); } catch (e) { /* ไม่เป็นไร */ } }
    return { ok: true, id: id, mt: sign_({ k: 'm', m: id, e: ctx.email, v: pwTag_(pw), x: ctx.sx }) };
  });
}

function opOpen_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const m = missionCtx_(ctx, ss, b.id);
  if (m.ix.status === 'CLOSED' && !viewAuth_(ctx, b)) throw err_('need_view', 'ภารกิจนี้เสร็จสิ้นแล้ว ต้อง Login ดูภารกิจที่เสร็จสิ้นก่อน');
  if (!m.ix.pw) throw err_('no_password', 'ภารกิจนี้ยังไม่ได้ตั้งรหัสภารกิจ ให้กด “เปลี่ยนรหัสภารกิจ” เพื่อตั้งรหัสก่อน');
  const ok = same_(String(b.mpw || ''), m.ix.pw);
  emailAttempt_(ctx, m.ix, ok, 'ใส่รหัสภารกิจ', 'mpw:' + m.ix.id);
  if (!ok) { Utilities.sleep(400); throw err_('mpw', MSG.mpw); }
  userLog_(ctx, m.ix, ctx.email, '', 'เข้าภารกิจ', missionLabel_(m.ix));
  return { ok: true, mt: sign_({ k: 'm', m: m.ix.id, e: ctx.email, v: pwTag_(m.ix.pw), x: ctx.sx }) };
}

// =====================================================================
// แท็บภารกิจ
// =====================================================================
function setupMissionSheet_(sh) {
  sh.getRange('A:K').setNumberFormat('@');
  sh.getRange('M:S').setNumberFormat('@');
  sh.getRange(1, 1).setValue('SEAT PLAN A340 · ผังที่นั่ง').setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue('บันทึกจากหน้าเว็บ · ประวัติการบันทึกอยู่ที่คอลัมน์ M ด้านขวา').setFontColor('#566575');
  INFO.forEach(function (f) { sh.getRange(f[2], 1).setValue(f[1]).setFontWeight('bold'); });
  sh.getRange(INFO[0][2], 2).setValue('A340');
  sh.getRange(CREW_FRONT_ROW, 1).setValue('กั้นที่นั่งลูกเรือ หัวเครื่อง ถึงแถว (CC = รวมห้อง Mission Commander)').setFontWeight('bold');
  sh.getRange(CREW_REAR_ROW, 1).setValue('กั้นที่นั่งลูกเรือ ท้ายเครื่อง ถึงแถว').setFontWeight('bold');
  sh.getRange(LAST_SAVE_ROW, 1).setValue('SAVE ล่าสุด').setFontWeight('bold');
  sh.getRange(VERSION_ROW, 1, 1, 2).setValues([['LAYOUT', '2']]).setFontColor('#9aa3ad');
  sh.getRange(PAX_HEAD_ROW, 1, 1, PAX_HEAD.length).setValues([PAX_HEAD]).setFontWeight('bold').setBackground('#dfeaf5');
  const seats = seatList_().map(function (s) { return [s[0], s[1], '', '', '', '', '', '', '', '', '']; });
  sh.getRange(PAX_FIRST_ROW, 1, seats.length, PAX_HEAD.length).setValues(seats);
  sh.getRange(1, LOG_COL).setValue('ประวัติการบันทึก').setFontWeight('bold').setFontSize(12);
  sh.getRange(2, LOG_COL, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold').setBackground('#dfeaf5');
  try {
    sh.setColumnWidth(1, 210); sh.setColumnWidth(2, 260); sh.setColumnWidths(3, 9, 120);
    sh.setColumnWidth(LOG_COL, 140); sh.setColumnWidth(LOG_COL + 1, 180); sh.setColumnWidth(LOG_COL + 4, 140); sh.setColumnWidths(LOG_COL + 5, 2, 260);
  } catch (e) { /* ความกว้างคอลัมน์ไม่สำคัญ */ }
}

// แท็บที่สร้างด้วยรุ่นก่อน (ข้อมูล A3:B10, รายชื่อ A17:H, ประวัติ J) → ย้ายเป็นรุ่น 2 ครั้งเดียว
function ensureLayout_(sh) {
  if (sh.getRange(VERSION_ROW, 2).getDisplayValue() === '2') return;
  if (sh.getRange(16, 1).getDisplayValue() !== 'ที่นั่ง') return;
  const top = dv_(sh.getRange(1, 1, 14, 2));
  const oldInfo = { name: top[3][1], flight: top[4][1], route: top[5][1], date: top[6][1], gate: top[7][1], time: top[8][1], note: top[9][1] };
  const crew = { front: top[11][1], rear: top[12][1] }, lastSave = top[13][1];
  const n = Math.max(0, sh.getLastRow() - 16);
  const pax = n ? dv_(sh.getRange(17, 1, n, 8)) : [];
  const lastLog = (function () { const v = sh.getRange(1, 10, sh.getMaxRows(), 1).getDisplayValues(); for (let i = v.length - 1; i >= 0; i--) if (v[i][0] !== '') return i + 1; return 0; })();
  const logs = lastLog >= 3 ? dv_(sh.getRange(3, 10, lastLog - 2, 6)) : [];
  sh.clear();
  setupMissionSheet_(sh);
  Object.keys(oldInfo).forEach(function (k) { if (oldInfo[k]) sh.getRange(infoRow_(k), 2).setValue(safe_(oldInfo[k])); });
  sh.getRange(CREW_FRONT_ROW, 2, 2, 1).setValues([[crew.front], [crew.rear]]);
  if (lastSave) sh.getRange(LAST_SAVE_ROW, 2).setValue(lastSave);
  const rowOf = {}; seatList_().forEach(function (s, i) { rowOf[s[0]] = PAX_FIRST_ROW + i; });
  pax.forEach(function (r) {
    const id = String(r[0]).trim(); if (!rowOf[id] || !(r[2] || r[3] || r[4] || r[5])) return;
    const th = splitName_(r[3]), en = splitName_(String(r[5]).toUpperCase());
    sh.getRange(rowOf[id], 3, 1, 9).setValues([[TYPE_PAX, r[2], th[0], th[1], String(r[4]).toUpperCase(), en[0], en[1], r[6], r[7]].map(safe_)]);
  });
  if (logs.length) sh.getRange(LOG_FIRST_ROW, LOG_COL, logs.length, LOG_HEAD.length).setValues(logs.map(function (r) { return [r[0], '', r[1], r[2], r[3], r[4], r[5]].map(safe_); }));
  appendLog_(sh, [[fmtTime_(new Date()), '', 'ระบบ', 'ปรับโครงแท็บเป็นรุ่น 2', sh.getName(), '', '']]);
}
function infoRow_(k) { for (let i = 0; i < INFO.length; i++) if (INFO[i][0] === k) return INFO[i][2]; return 0; }
function splitName_(s) { s = str_(s).replace(/\s+/g, ' '); const i = s.indexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }

function readMission_(sh) {
  ensureLayout_(sh);
  const top = dv_(sh.getRange(1, 1, VERSION_ROW, 2));
  const info = {};
  INFO.forEach(function (f) { info[f[0]] = top[f[2] - 1][1]; });
  info.aircraft = 'A340';
  const crew = { front: top[CREW_FRONT_ROW - 1][1], rear: top[CREW_REAR_ROW - 1][1] };
  let lastSave = null;
  try { lastSave = top[LAST_SAVE_ROW - 1][1] ? JSON.parse(top[LAST_SAVE_ROW - 1][1]) : null; } catch (err) { lastSave = null; }
  const seats = seatList_(), pax = {}, crewPax = {}, rowOf = {};
  const rows = dv_(sh.getRange(PAX_FIRST_ROW, 1, seats.length, PAX_HEAD.length));
  rows.forEach(function (r, i) {
    const id = String(r[0]).trim();
    if (!id) return;
    rowOf[id] = PAX_FIRST_ROW + i;
    const p = { rt: r[3], ft: r[4], lt: r[5], re: r[6], fe: r[7], le: r[8], by: r[9], at: r[10] };
    if (isEmptyPerson_(p)) return;
    if (r[2] === TYPE_CREW) crewPax[id] = p; else pax[id] = p;
  });
  return { info: info, crew: crew, pax: pax, crewPax: crewPax, rowOf: rowOf, lastSave: lastSave };
}
function readLog_(sh, max) {
  const last = lastLogRow_(sh);
  if (last < LOG_FIRST_ROW) return [];
  const from = Math.max(LOG_FIRST_ROW, last - max + 1);
  return dv_(sh.getRange(from, LOG_COL, last - from + 1, LOG_HEAD.length)).reverse();
}

function opLoad_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const m = missionCtx_(ctx, ss, b.id);
  missionAuth_(ctx, m.ix);
  let isAdmin = false;
  let adminWhy = '';
  if (b.at) { try { adminAuth_(ctx, m.ix); isAdmin = true; } catch (e) { isAdmin = false; adminWhy = String(e && e.message || ''); } }
  const st = readMission_(m.sh);
  let status = {}, statusError = '';
  try { status = adminStatus_(); } catch (err) { statusError = String(err && err.message || err); }
  // รายชื่อลูกเรือเห็นได้เฉพาะคนที่ Login ADMIN: ซ่อนประวัติการเพิ่ม / แก้ / ลบลูกเรือจากผู้ใช้ทั่วไป
  const history = readLog_(m.sh, 300).filter(function (r) { return isAdmin || !/ลูกเรือ/.test(r[3]) || /^กั้นที่นั่งลูกเรือ/.test(r[3]); })
    .slice(0, 150).map(function (r) { return [r[0], r[2], r[3], r[4], r[5], r[6]]; });
  return {
    ok: true, id: m.ix.id, tab: m.sh.getName(), mstatus: m.ix.status, closeInfo: m.ix.closeInfo,
    info: st.info, crew: st.crew, pax: st.pax, crewPax: isAdmin ? st.crewPax : undefined, admin: isAdmin ? ctx.admin : '',
    lastSave: st.lastSave, status: status, statusError: statusError, history: history, adminWhy: adminWhy
  };
}

// ---------- บันทึก (ผู้โดยสาร) ----------
function opSave_(ctx, b) {
  session_(ctx);
  const by = clean_(b.by, 60);
  if (!by) throw err_('need_name', 'กรุณากรอกชื่อผู้บันทึกก่อน SAVE');
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const m = missionCtx_(ctx, ss, b.id);
    missionAuth_(ctx, m.ix);
    if (m.ix.status === 'CLOSED') throw err_('closed', MSG.closed);
    const cur = readMission_(m.sh);
    if (String(b.rev || '') !== String(cur.lastSave && cur.lastSave.at || '')) return { ok: false, error: 'stale', lastSave: cur.lastSave };
    const now = new Date(ctx.now), nowTxt = fmtTime_(now), log = [], conflicts = [];
    let n = 0;
    // ข้อมูลภารกิจ (ประเภทเครื่องบินล็อกเป็น A340)
    const info = b.info || {};
    INFO.forEach(function (f) {
      const k = f[0]; if (k === 'aircraft' || !(k in info)) return;
      const ch = info[k] || {}, v = normInfo_(k, ch.val), base = normInfo_(k, ch.base);
      if (v === cur.info[k]) return;
      if (base !== cur.info[k]) { conflicts.push({ id: k, kind: 'info' }); return; }
      m.sh.getRange(f[2], 2).setValue(safe_(v));
      log.push([nowTxt, ctx.email, by, 'ข้อมูลภารกิจ', f[1], cur.info[k], v]);
      cur.info[k] = v; n++;
    });
    // ผู้โดยสารรายที่นั่ง
    const crewSet = crewRows_(cur.crew);
    (Array.isArray(b.pax) ? b.pax.slice(0, 400) : []).forEach(function (p) {
      const id = String(p.id || ''), row = cur.rowOf[id];
      if (!row) return;
      const val = normPerson_(p.val), base = normPerson_(p.base), old = cur.pax[id] || normPerson_(null);
      if (samePerson_(old, val)) return;
      if (crewSet[SEAT_ROW[id]] || cur.crewPax[id]) { conflicts.push({ id: id, kind: 'crew' }); return; }
      if (!samePerson_(old, base)) { conflicts.push({ id: id, kind: 'pax' }); return; }
      const empty = isEmptyPerson_(val);
      m.sh.getRange(row, 3, 1, 9).setValues([[empty ? '' : TYPE_PAX].concat(PF.map(function (k) { return val[k]; }), [empty ? '' : by, empty ? '' : nowTxt]).map(safe_)]);
      log.push([nowTxt, ctx.email, by, empty ? 'ลบผู้โดยสาร' : (isEmptyPerson_(old) ? 'เพิ่มผู้โดยสาร' : 'แก้ไขผู้โดยสาร'), id, personTxt_(old), personTxt_(val)]);
      if (empty) delete cur.pax[id]; else cur.pax[id] = val;
      n++;
    });
    return finishSave_(ctx, ss, m, cur, log, n, by, now, conflicts, false);
  });
}

function finishSave_(ctx, ss, m, cur, log, n, by, now, conflicts, admin) {
  const nowTxt = fmtTime_(now);
  appendLog_(m.sh, log);
  const lastSave = n ? { by: by, at: now.toISOString(), n: n, e: ctx.email, u: admin ? (ctx.admin || '') : '' } : cur.lastSave;
  if (n) { m.sh.getRange(LAST_SAVE_ROW, 2).setValue(JSON.stringify(lastSave)); cput_('ls:' + m.ix.id, lastSave || {}, 21600); }
  // ชื่อแท็บ = เที่ยวบิน S<Sector> วันที่
  const want = tabTitle_(cur.info.flight, cur.info.sectorNo, cur.info.date, '');
  if (want && want !== m.sh.getName()) {
    const t = uniqueTitle_(ss, want, m.sh);
    if (t !== m.sh.getName()) m.sh.setName(t);
  }
  if (n) {
    setIndex_(ss, m.ix.row, { tab: m.sh.getName(), name: cur.info.name, flight: cur.info.flight, route: cur.info.route, date: cur.info.date,
      sectorNo: cur.info.sectorNo, pax: String(Object.keys(cur.pax).length), updated: nowTxt, by: by });
    m.ix.tab = m.sh.getName(); m.ix.flight = cur.info.flight; m.ix.sectorNo = cur.info.sectorNo; m.ix.date = cur.info.date;
    if (admin) log.forEach(function (r) { adminAct_(ctx, ctx.admin, m.ix, r[3], r[4] + (r[5] || r[6] ? ' : ' + (r[5] || '-') + ' → ' + (r[6] || '-') : '')); });
    else userLogRows_(ctx, m.ix, log.map(function (r) { return [now, ctx.email, by, r[3], r[4] + ' : ' + (r[5] || '-') + ' → ' + (r[6] || '-')]; }));
  }
  return { ok: true, saved: n, conflicts: conflicts, lastSave: lastSave, tab: m.sh.getName() };
}

// ---------- เหตุการณ์จากหน้าเว็บ (PREVIEW / EXPORT TO PDF / PRINT BOARDING PASS) ----------
function opLog_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const what = clean_(b.what, 60), detail = clean_(b.detail, 300);
  if (!what) return { ok: true };
  if (!b.id) { userLog_(ctx, null, ctx.email, clean_(b.by, 60), what, detail); return { ok: true }; }
  const m = missionCtx_(ctx, ss, b.id);
  missionAuth_(ctx, m.ix);
  if (b.at) { adminAuth_(ctx, m.ix); adminAct_(ctx, ctx.admin, m.ix, what, detail); }
  else userLog_(ctx, m.ix, ctx.email, clean_(b.by, 60), what, detail);
  return { ok: true };
}

// =====================================================================
// Login ด้วยข้อมูลใน LOGIN DATABASE (เปลี่ยนรหัส / ปิด / เปิดภารกิจ / หน้า ADMIN)
// =====================================================================
function parseDb_(values, tz) {
  let head = -1;
  for (let i = 0; i < values.length && head < 0; i++) { const r = values[i].map(norm_); if (r.indexOf(norm_(COL.username)) >= 0 && r.indexOf(norm_(COL.name)) >= 0) head = i; }
  if (head < 0) throw err_('config', 'ไม่พบแถวหัวคอลัมน์ในแท็บ ' + OPT.loginTab);
  const hr = values[head].map(norm_), col = {};
  Object.keys(COL).forEach(function (k) { col[k] = hr.indexOf(norm_(COL[k])); });
  if (col.username < 0 || col.salt < 0 || col.hash < 0 || col.idGov < 0 || col.birth < 0) throw err_('config', 'แท็บ ' + OPT.loginTab + ' ไม่มีคอลัมน์ที่ต้องใช้');
  const people = [], nameHead = norm_(COL.name);
  const at = function (r, k) { return col[k] < 0 ? '' : r[col[k]]; };
  for (let i = 0; i < values.length; i++) {
    const r = values[i], name = str_(at(r, 'name'));
    if (!name || norm_(name) === nameHead) continue;
    const endRaw = at(r, 'end'), end = toIso_(endRaw, tz), roleText = norm_(at(r, 'role'));
    people.push({
      name: name, pos: str_(at(r, 'pos')), idGov: digits_(at(r, 'idGov')), idCit: digits_(at(r, 'idCit')), birth: toIso_(at(r, 'birth'), tz),
      role: OPT.roles.filter(function (x) { return x.toLowerCase() === roleText; })[0] || '',
      username: str_(at(r, 'username')), salt: str_(at(r, 'salt')), hash: str_(at(r, 'hash')), end: end, endBad: !end && str_(endRaw) !== ''
    });
  }
  return people;
}
function loginDb_() {
  const ss = SpreadsheetApp.openById(prop_(PROP.db)), sh = ss.getSheetByName(OPT.loginTab);
  if (!sh) throw err_('config', 'ไม่พบแท็บ "' + OPT.loginTab + '" ในไฟล์ LOGIN DATABASE');
  return parseDb_(sh.getDataRange().getValues(), ss.getSpreadsheetTimeZone() || OPT.tz);
}
function canLogin_(p) { return BASE.every(function (k) { return !!p[k]; }) && !!p.role && !!p.username && !!p.salt && !!p.hash; }
function expired_(p) { return p.endBad || (!!p.end && Utilities.formatDate(new Date(), OPT.tz, 'yyyy-MM-dd') > p.end); }

// ตรวจ 4 อย่างพร้อมกันทุกครั้ง (+ รหัสภารกิจเมื่อ extraOk ถูกส่งมา) ไม่บอกว่าผิดช่องไหน
// ผิดติดกัน 5 ครั้ง พัก 60 นาที อีก 5 ครั้งบล็อกจนแอดมินปลด · นับทั้ง Username (LOCKED USERS) และ Email (LOCKED EMAILS)
// ต้องเรียกภายใน withLock_
function credCheck_(ctx, cred, purpose, ix, extraOk, extraWhy) {
  cred = cred || {};
  const username = str_(cred.u).toLowerCase(), password = String(cred.p == null ? '' : cred.p), email = ctx.email || '';
  const mission = ix ? missionLabel_(ix) : '';
  const fail = function (event, detail) {
    loginLog_(ctx, username, event, purpose, mission, detail || '');
    Utilities.sleep(600);
    return err_('login_failed', MSG.login);
  };
  const people = loginDb_();
  const who = username ? people.filter(function (p) { return p.username.toLowerCase() === username; }) : [];
  const known = who.length === 1 && username.length <= 60;
  const lockU = known ? lockState_(username, ctx.now, LOCK_USER) : null;
  const lockE = email ? lockState_(email, ctx.now, LOCK_EMAIL) : null;
  const held = function (st) { return st && (st.status === 'BLOCKED' || (st.status === 'PAUSED' && st.until > ctx.now)); };
  if (held(lockU) || held(lockE)) {
    pwHash_(password || 'x', 'no-such-account');
    const w = [];
    if (held(lockU)) w.push('Username ' + (lockU.status === 'BLOCKED' ? 'ถูกบล็อก' : 'ถูกพักถึง ' + fmtTime_(new Date(lockU.until))));
    if (held(lockE)) w.push('Email ' + (lockE.status === 'BLOCKED' ? 'ถูกบล็อก' : 'ถูกพักถึง ' + fmtTime_(new Date(lockE.until))));
    throw fail((held(lockU) && lockU.status === 'BLOCKED') || (held(lockE) && lockE.status === 'BLOCKED') ? 'LOGIN_BLOCKED' : 'LOGIN_PAUSED', w.join(' · '));
  }
  const p = known && canLogin_(who[0]) && people.filter(function (q) { return q !== who[0] && q.idGov && q.idGov === who[0].idGov; }).length === 0 ? who[0] : null;
  const okPw = !!password && password.length <= 200 && pwCheck_(password, p ? p.salt : '', p ? p.hash : '');
  const okId = !!p && same_(p.idGov, digits_(cred.idGov));
  const okBirth = !!p && same_(p.birth, str_(cred.birth));
  const okExtra = extraOk === undefined ? true : !!extraOk;
  if (!(okPw && okId && okBirth && okExtra) || !p || expired_(p)) {
    let detail = !username || !password ? 'กรอกไม่ครบ' : !known ? 'ไม่พบ Username' : 'ข้อมูลไม่ถูกต้อง';
    if (p && okPw && okId && okBirth && !okExtra) detail = extraWhy || 'รหัสภารกิจไม่ถูกต้อง';
    else if (p && okPw && okId && okBirth) detail = 'เลยวันสิ้นสุดการใช้งาน';
    let ev = 'LOGIN_FAIL';
    const add = function (label, key, st, kind) {
      if (!st) return;
      const r = lockFail_(key, st, ctx.now, kind);
      detail += ' · ' + label + ' ผิดครั้งที่ ' + r.fails + (r.round ? ' (หลังพัก)' : '');
      if (r.status === 'PAUSED') { if (ev === 'LOGIN_FAIL') ev = 'LOGIN_PAUSED'; detail += ' พัก ' + OPT.pauseMinutes + ' นาที'; }
      if (r.status === 'BLOCKED') { ev = 'LOGIN_BLOCKED'; detail += ' บล็อก (ปลดในแท็บ ' + kind.tab + ')'; }
    };
    add('Username', username, lockU, LOCK_USER);
    add('Email', email, lockE, LOCK_EMAIL);
    throw fail(ev, detail);
  }
  lockReset_(username, lockU, ctx.now, LOCK_USER);
  lockReset_(email, lockE, ctx.now, LOCK_EMAIL);
  // เพิ่งปลดบล็อกในชีต แต่สำเนาใน cache ยังจำว่าบล็อก: อ่านใหม่ บัตรผ่านที่จะออกให้จะได้ใช้ได้ทันที
  if (blocked_().u[username] || (email && blocked_().e[email])) { cdel_('blk'); BLK_ = null; }
  loginLog_(ctx, username, 'LOGIN_OK', purpose, mission, '');
  return p;
}

function opMpwChange_(ctx, b) {
  session_(ctx);
  const pw = String(b.newPw || '');
  if (pw.length < OPT.minMissionPw || pw.length > 60) throw err_('bad_request', 'รหัสภารกิจใหม่ต้องมีอย่างน้อย ' + OPT.minMissionPw + ' ตัว');
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const m = missionCtx_(ctx, ss, b.id);
    const p = credCheck_(ctx, b.cred, 'เปลี่ยนรหัสภารกิจ', m.ix);
    setIndex_(ss, m.ix.row, { pw: pw });
    cput_('mp:' + m.ix.id, pwTag_(pw), 60);
    adminAct_(ctx, p.username, m.ix, 'เปลี่ยนรหัสภารกิจ', m.ix.pw ? 'เปลี่ยนรหัสใหม่ (รหัสดูได้ในแท็บ ' + INDEX_SHEET + ')' : 'ตั้งรหัสครั้งแรก');
    appendLog_(m.sh, [[fmtTime_(new Date(ctx.now)), ctx.email, p.username, 'เปลี่ยนรหัสภารกิจ', '', '', '']]);
    userLog_(ctx, m.ix, ctx.email, p.username, 'เปลี่ยนรหัสภารกิจ', 'โดย ' + p.username);
    return { ok: true };
  });
}
function opClose_(ctx, b) {
  session_(ctx);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const m = missionCtx_(ctx, ss, b.id);
    // ปิดภารกิจต้องใช้รหัสภารกิจด้วย ตรวจพร้อมกับข้อมูล Login และนับเป็นครั้งที่ผิดเหมือนกัน
    const p = credCheck_(ctx, b.cred, 'ปิดภารกิจ', m.ix, !!m.ix.pw && same_(String(b.mpw || ''), m.ix.pw), m.ix.pw ? 'รหัสภารกิจไม่ถูกต้อง' : 'ภารกิจยังไม่ได้ตั้งรหัส');
    if (m.ix.status === 'CLOSED') return { ok: true, already: true };
    const t = fmtTime_(new Date(ctx.now));
    setIndex_(ss, m.ix.row, { status: 'CLOSED', closeInfo: 'ปิด ' + t + ' โดย ' + p.username });
    adminAct_(ctx, p.username, m.ix, 'ปิดภารกิจ', missionLabel_(m.ix));
    appendLog_(m.sh, [[t, ctx.email, p.username, 'ปิดภารกิจ', '', 'OPEN', 'CLOSED']]);
    userLog_(ctx, m.ix, ctx.email, p.username, 'ปิดภารกิจ', 'โดย ' + p.username);
    return { ok: true };
  });
}
function opReopen_(ctx, b) {
  session_(ctx);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const m = missionCtx_(ctx, ss, b.id);
    const p = credCheck_(ctx, b.cred, 'เปิดภารกิจอีกครั้ง', m.ix, !!m.ix.pw && same_(String(b.mpw || ''), m.ix.pw), m.ix.pw ? 'รหัสภารกิจไม่ถูกต้อง' : 'ภารกิจยังไม่ได้ตั้งรหัส');
    const t = fmtTime_(new Date(ctx.now));
    setIndex_(ss, m.ix.row, { status: 'OPEN', closeInfo: 'เปิดอีกครั้ง ' + t + ' โดย ' + p.username });
    adminAct_(ctx, p.username, m.ix, 'เปิดภารกิจอีกครั้ง', missionLabel_(m.ix));
    appendLog_(m.sh, [[t, ctx.email, p.username, 'เปิดภารกิจอีกครั้ง', '', 'CLOSED', 'OPEN']]);
    userLog_(ctx, m.ix, ctx.email, p.username, 'เปิดภารกิจอีกครั้ง', 'โดย ' + p.username);
    return { ok: true };
  });
}

// ---------- หน้า ADMIN ----------
function opAdminLogin_(ctx, b) {
  session_(ctx);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const m = missionCtx_(ctx, ss, b.id);
    missionAuth_(ctx, m.ix);
    const p = credCheck_(ctx, b.cred, 'ADMIN PAGE', m.ix);
    return loginOrWait_(ctx, { act: 'admin', w: ctx.w, e: ctx.email, u: p.username.toLowerCase(), h: hTag_(p.hash), m: m.ix.id });
  });
}
function opAdminLogout_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const m = missionCtx_(ctx, ss, b.id);
  const t = unsign_(b.at, 'a', ctx.now);
  if (t && t.m === m.ix.id && t.w === ctx.w) {
    loginLog_(ctx, t.u, 'LOGOUT', 'ADMIN PAGE', missionLabel_(m.ix), clean_(b.why, 80)); adminAct_(ctx, t.u, m.ix, 'ออกจากหน้า ADMIN', clean_(b.why, 80));
    const v = unsign_(b.vt, 'v', ctx.now);
    if (!(v && v.w === ctx.w && v.u === t.u)) release_(ownKey_('u', t.u), ctx.w);
  }
  return { ok: true };
}
function opAdminSave_(ctx, b) {
  session_(ctx);
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const m = missionCtx_(ctx, ss, b.id);
    missionAuth_(ctx, m.ix);
    const a = adminAuth_(ctx, m.ix), by = a.u;
    if (m.ix.status === 'CLOSED') throw err_('closed', MSG.closed);
    const cur = readMission_(m.sh);
    if (String(b.rev || '') !== String(cur.lastSave && cur.lastSave.at || '')) return { ok: false, error: 'stale', lastSave: cur.lastSave };
    const now = new Date(ctx.now), nowTxt = fmtTime_(now), log = [], conflicts = [];
    let n = 0;
    // กั้นที่นั่งลูกเรือ
    if (b.crew) {
      const nc = { front: clean_(b.crew.front, 8).toUpperCase(), rear: clean_(b.crew.rear, 4) };
      const ff = crewFront_(nc.front);
      if (!ff) nc.front = '';
      if (nc.rear && ROWS.indexOf(nc.rear) < 1) nc.rear = '';
      const ri = ROWS.indexOf(nc.rear);
      if (ff && ri > 0 && ff.end >= ri) throw err_('bad_request', 'กั้นจากหัวเครื่องและท้ายเครื่องซ้อนกัน');
      [['front', CREW_FRONT_ROW, 'หัวเครื่อง'], ['rear', CREW_REAR_ROW, 'ท้ายเครื่อง']].forEach(function (c) {
        if (nc[c[0]] === cur.crew[c[0]]) return;
        m.sh.getRange(c[1], 2).setValue(nc[c[0]]);
        const txt = function (v) { return c[0] === 'front' ? crewFrontTxt_(v) : (v ? 'ถึงแถว ' + v : 'ไม่กั้น'); };
        log.push([nowTxt, ctx.email, by, 'กั้นที่นั่งลูกเรือ (ADMIN)', c[2], txt(cur.crew[c[0]]), txt(nc[c[0]])]);
        cur.crew[c[0]] = nc[c[0]]; n++;
      });
    }
    const crewSet = crewRows_(cur.crew);
    const writeRow = function (id, type, val, who) {
      const empty = isEmptyPerson_(val);
      m.sh.getRange(cur.rowOf[id], 3, 1, 9).setValues([[empty ? '' : type].concat(PF.map(function (k) { return val[k]; }), [empty ? '' : who, empty ? '' : nowTxt]).map(safe_)]);
    };
    // ผู้โดยสารที่อยู่ในแถวที่ถูกกั้น และลูกเรือที่อยู่นอก CREW ZONE ถูกล้างออก
    Object.keys(cur.pax).forEach(function (id) {
      if (!crewSet[SEAT_ROW[id]]) return;
      log.push([nowTxt, ctx.email, by, 'ลบผู้โดยสาร (กั้น CREW ZONE)', id, personTxt_(cur.pax[id]), '']);
      writeRow(id, TYPE_PAX, normPerson_(null), by); delete cur.pax[id]; n++;
    });
    Object.keys(cur.crewPax).forEach(function (id) {
      if (crewSet[SEAT_ROW[id]]) return;
      log.push([nowTxt, ctx.email, by, 'ลบลูกเรือ (ไม่อยู่ใน CREW ZONE)', id, personTxt_(cur.crewPax[id]), '']);
      writeRow(id, TYPE_CREW, normPerson_(null), by); delete cur.crewPax[id]; n++;
    });
    // ลูกเรือรายที่นั่ง
    (Array.isArray(b.crewPax) ? b.crewPax.slice(0, 400) : []).forEach(function (p) {
      const id = String(p.id || '');
      if (!cur.rowOf[id]) return;
      const val = normPerson_(p.val), base = normPerson_(p.base), old = cur.crewPax[id] || normPerson_(null);
      if (samePerson_(old, val)) return;
      if (!crewSet[SEAT_ROW[id]] || cur.pax[id]) { conflicts.push({ id: id, kind: 'notcrew' }); return; }
      if (!samePerson_(old, base)) { conflicts.push({ id: id, kind: 'crew' }); return; }
      const empty = isEmptyPerson_(val);
      writeRow(id, TYPE_CREW, val, by);
      log.push([nowTxt, ctx.email, by, empty ? 'ลบลูกเรือ' : (isEmptyPerson_(old) ? 'เพิ่มลูกเรือ' : 'แก้ไขลูกเรือ'), id, personTxt_(old), personTxt_(val)]);
      if (empty) delete cur.crewPax[id]; else cur.crewPax[id] = val;
      n++;
    });
    return finishSave_(ctx, ss, m, cur, log, n, by, now, conflicts, true);
  });
}

// ---------- LOCKED USERS / LOCKED EMAILS (ไฟล์ Admin Page) ----------
// สถานะ: ACTIVE (ปกติ) · PAUSED (ผิดครบ พักชั่วคราว) · LAST_TRY (พักครบแล้ว เหลือโอกาสอีกรอบ) · BLOCKED (แอดมินต้องปลด)
function lockSheet_(kind) { kind = kind || LOCK_USER; return logTab_(prop_(PROP.alog), kind.tab, kind.head); }
function lockState_(key, now, kind) {
  const sh = lockSheet_(kind), n = sh.getLastRow();
  if (n > 1) {
    const v = dv_(sh.getRange(2, 1, n - 1, 5));
    for (let i = 0; i < v.length; i++) {
      if (str_(v[i][0]).toLowerCase() !== key) continue;
      const st = { row: i + 2, status: str_(v[i][1]).toUpperCase() || 'ACTIVE', fails: Number(v[i][2]) || 0, until: parseTime_(v[i][3]), round: Number(v[i][4]) || 0 };
      if (['ACTIVE', 'PAUSED', 'LAST_TRY', 'BLOCKED'].indexOf(st.status) < 0) st.status = 'ACTIVE';
      // ระบบไม่เคยเขียน ACTIVE คู่กับรอบที่ 2: แปลว่าแอดมินแก้สถานะเป็น ACTIVE เพื่อปลดบล็อก เริ่มนับใหม่
      if (st.status === 'ACTIVE' && st.round > 0) { st.round = 0; st.fails = 0; st.until = 0; st.dirty = true; }
      if (st.status === 'PAUSED' && st.until <= now) { st.status = 'LAST_TRY'; st.round = 1; st.fails = 0; st.until = 0; }
      return st;
    }
  }
  return { row: 0, status: 'ACTIVE', fails: 0, until: 0, round: 0 };
}
function lockWrite_(key, st, now, kind) {
  kind = kind || LOCK_USER;
  const sh = lockSheet_(kind);
  const note = st.status === 'BLOCKED' ? 'แก้ช่องสถานะเป็น ACTIVE เพื่อปลดบล็อก' : st.status === 'PAUSED' ? 'พักอัตโนมัติ ' + kind.pause() + ' นาที' : '';
  const row = [safe_(key), st.status, String(st.fails), st.until ? fmtTime_(new Date(st.until)) : '', String(st.round), fmtTime_(new Date(now)), note];
  if (st.row) sh.getRange(st.row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}
function lockFail_(key, st, now, kind) {
  kind = kind || LOCK_USER;
  st.fails++;
  const out = { fails: st.fails, round: st.round, status: st.status };
  if (st.fails >= kind.max()) {
    if (st.round >= 1) { st.status = 'BLOCKED'; st.until = 0; }
    else { st.status = 'PAUSED'; st.until = now + kind.pause() * 60000; st.round = 1; st.fails = 0; }
    out.status = st.status;
  }
  lockWrite_(key, st, now, kind);
  if (st.status === 'BLOCKED') { cdel_('blk'); BLK_ = null; }
  return out;
}
function lockOk_(key, st, now, kind) { st.status = 'ACTIVE'; st.fails = 0; st.round = 0; st.until = 0; lockWrite_(key, st, now, kind); }
function lockReset_(key, st, now, kind) { if (st && st.row && (st.dirty || st.fails || st.round || st.status !== 'ACTIVE')) lockOk_(key, st, now, kind); }
function untilTxt_(t) { return fmtTime_(new Date(t)).slice(11, 16) + ' น.'; }
// รหัสเว็บไซต์ / รหัสภารกิจ: นับต่อ Email (LOCKED EMAILS) ถูกพักหรือบล็อกแล้วไม่ตรวจรหัส
// ยังไม่ได้ตั้ง Sign in with Google (ไม่มีอีเมล): พักชั่วคราวใน cache ตามกติกาเดียวกัน แต่ไม่บล็อกถาวร
function emailAttempt_(ctx, ix, ok, what, anonKey) {
  const email = ctx.email;
  if (!email) {
    const cache = CacheService.getScriptCache(), key = 'af:' + anonKey, fails = Number(cache.get(key)) || 0;
    if (fails >= OPT.maxFails) throw err_('locked', MSG.locked);
    if (ok) { if (fails) cache.remove(key); return; }
    cache.put(key, String(fails + 1), OPT.pauseMinutes * 60);
    userLog_(ctx, ix, '', '', what + 'ผิด', 'ครั้งที่ ' + (fails + 1));
    return;
  }
  withLock_(function () {
    const st = lockState_(email, ctx.now, LOCK_EMAIL);
    if (st.status === 'BLOCKED') { userLog_(ctx, ix, email, '', what + ' (ถูกบล็อก)', 'ให้แอดมินแก้สถานะเป็น ACTIVE ในแท็บ ' + AL_PINLOCK); throw err_('blocked', MSG.blocked); }
    if (st.status === 'PAUSED') { userLog_(ctx, ix, email, '', what + ' (ถูกพัก)', 'พักถึง ' + fmtTime_(new Date(st.until))); throw err_('locked', 'ใส่ข้อมูลผิดหลายครั้ง ให้รอถึง ' + untilTxt_(st.until) + ' แล้วลองใหม่'); }
    // ใส่ถูกแล้วเริ่มนับใหม่ ยกเว้นช่วงหลังพัก (LAST_TRY): รหัสเว็บไซต์ / รหัสภารกิจที่ถูกไม่ล้างรอบที่ 2
    // จะล้างได้ด้วยการ Login ด้วย LOGIN DATABASE สำเร็จ หรือแอดมินแก้สถานะเป็น ACTIVE
    if (ok) { if (st.status !== 'LAST_TRY') lockReset_(email, st, ctx.now, LOCK_EMAIL); if (blocked_().e[email]) { cdel_('blk'); BLK_ = null; } return; }
    const r = lockFail_(email, st, ctx.now, LOCK_EMAIL);
    userLog_(ctx, ix, email, '', what + 'ผิด', 'ครั้งที่ ' + r.fails + (r.round ? ' (หลังพัก)' : '') + (r.status === 'PAUSED' ? ' · พัก ' + OPT.pauseMinutes + ' นาที' : r.status === 'BLOCKED' ? ' · บล็อก (ปลดในแท็บ ' + AL_PINLOCK + ')' : ''));
  });
}
// 'dd/MM/yyyy HH:mm:ss' (เวลาไทย) → ms
function parseTime_(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(str_(s));
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 7, +m[5], +m[6]) : 0;
}

// =====================================================================
// ไฟล์ประวัติ
// =====================================================================
function logTab_(fileIdValue, name, head) {
  const id = fileId_(fileIdValue);
  if (!id) throw err_('config', 'ยังไม่ได้ตั้งค่าไฟล์ประวัติใน setup()');
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    const first = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && first.getLastRow() === 0 && /^(Sheet1|ชีต1|แผ่น1)$/.test(first.getName())) { sh = first; sh.setName(name); }
    else sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#dfeaf5');
    sh.setFrozenRows(1);
    try { sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss'); sh.getRange('B:Z').setNumberFormat('@'); } catch (e) { /* รูปแบบไม่สำคัญ */ }
  }
  return sh;
}
function quietly_(fn) { try { fn(); } catch (e) { console.error('log: ' + (e && e.message || e)); } }
// User Page: แท็บ "หน้าแรก" (ix = null) หรือแท็บของภารกิจ (สร้างเมื่อใช้ครั้งแรก จำ gid ไว้ในแท็บรายการภารกิจ)
function userLog_(ctx, ix, email, by, action, detail, extra) { userLogRows_(ctx, ix, [[new Date(ctx.now), email || '', by || '', action, detail || ''].concat(extra ? [extra] : [])]); }
function userLogRows_(ctx, ix, rows) {
  if (!rows.length) return;
  quietly_(function () {
    const fid = prop_(PROP.ulog);
    if (!fid) return;
    let sh, head = UL_HEAD;
    if (!ix) {
      head = UL_HOME_HEAD;
      sh = logTab_(fid, UL_HOME, head);
      if (sh.getRange(1, head.length).getDisplayValue() !== head[head.length - 1]) {   // แท็บที่สร้างก่อนมีคอลัมน์ F
        sh.getRange(1, head.length).setValue(head[head.length - 1]).setFontWeight('bold').setBackground('#dfeaf5');
        try { sh.setColumnWidth(head.length, 420); sh.getRange(1, head.length, sh.getMaxRows(), 1).setWrap(true); } catch (e) { /* ไม่สำคัญ */ }
      }
    }
    else {
      const ss = SpreadsheetApp.openById(fileId_(fid));
      sh = ix.ulog ? sheetById_(ss, ix.ulog) : null;
      if (!sh) {
        const title = uniqueTitle_(ss, (ix.tab || 'ภารกิจ ' + ix.id).replace(/[\[\]\*\?\/\\:']/g, '-').slice(0, 90), null);
        sh = logTab_(fid, title, UL_HEAD);
        ix.ulog = String(sh.getSheetId());
        setIndex_(SpreadsheetApp.getActive(), ix.row, { ulog: ix.ulog });
      } else if (ix.tab && sh.getName() !== ix.tab) {
        const t = uniqueTitle_(ss, ix.tab, sh); if (t !== sh.getName()) sh.setName(t);
      }
    }
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, head.length).setValues(rows.map(function (r) {
      const o = [r[0]].concat(r.slice(1, head.length).map(safe_)); while (o.length < head.length) o.push(''); return o; }));
  });
}
function loginLog_(ctx, username, event, purpose, mission, detail) {
  quietly_(function () { logTab_(prop_(PROP.alog), AL_LOGIN, AL_LOGIN_HEAD).appendRow([new Date(ctx.now)].concat([ctx.email || '', username || '', event, purpose || '', mission || '', detail || ''].map(safe_))); });
}
function adminAct_(ctx, username, ix, action, detail) {
  quietly_(function () { logTab_(prop_(PROP.alog), AL_ACT, AL_ACT_HEAD).appendRow([new Date(ctx.now)].concat([ctx.email || '', username || '', ix ? missionLabel_(ix) : '', action, detail || ''].map(safe_))); });
}

// =====================================================================
// helpers
// =====================================================================
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { throw err_('busy', MSG.busy); }
  // เขียนลงชีตให้เสร็จจริง (flush) ก่อนปล่อยคิว เครื่องถัดไปจะได้อ่านข้อมูลล่าสุดเสมอ
  try { return fn(); } finally { try { SpreadsheetApp.flush(); } catch (e) { /* ไม่มีอะไรค้าง */ } lock.releaseLock(); }
}
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function norm_(v) { return str_(v).toLowerCase().replace(/\s+/g, ' '); }
function digits_(v) { return str_(v).replace(/\D/g, ''); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
// ข้อความที่ขึ้นต้นด้วย = + - @ ต้องไม่ถูกอ่านเป็นสูตร: ใส่อักษรกว้างศูนย์ (มองไม่เห็น) ไว้หน้า แล้วตัดออกตอนอ่าน
const ZW = '\u200B';
function safe_(v) { if (typeof v !== 'string') return v; return /^[=+\-@]/.test(v) ? ZW + v : v; }
function dv_(range) { return range.getDisplayValues().map(function (r) { return r.map(function (x) { return String(x).charAt(0) === ZW ? String(x).slice(1) : x; }); }); }
function fmtTime_(d) { return Utilities.formatDate(d, OPT.tz, 'dd/MM/yyyy HH:mm:ss'); }
function normInfo_(k, v) {
  v = clean_(v, k === 'name' || k === 'note' ? 300 : 40);
  if (k === 'flight' || k === 'route' || k === 'gate' || k === 'date') v = v.toUpperCase();
  if (k === 'sectorNo') v = v.replace(/[^0-9A-Za-z]/g, '').slice(0, 4);
  if (k === 'route') v = v.replace(/\s*[-–—\/>]+\s*/g, '-').replace(/\s+/g, '-');
  return v;
}
function normPerson_(p) {
  p = p || {};
  const o = {};
  PF.forEach(function (k) { let v = clean_(p[k], k === 'rt' || k === 're' ? 30 : 80).replace(/\s{2,}/g, ' '); if (k === 're' || k === 'fe' || k === 'le') v = v.toUpperCase(); o[k] = v; });
  return o;
}
function isEmptyPerson_(p) { p = p || {}; return PF.every(function (k) { return !str_(p[k]); }); }
function samePerson_(a, b) { a = a || {}; b = b || {}; return PF.every(function (k) { return str_(a[k]) === str_(b[k]); }); }
function personTxt_(p) {
  if (!p || isEmptyPerson_(p)) return '';
  const th = [p.rt, p.ft, p.lt].filter(String).join(' '), en = [p.re, p.fe, p.le].filter(String).join(' ');
  return [th, en].filter(String).join(' / ');
}
function lastLogRow_(sh) {
  const v = sh.getRange(1, LOG_COL, sh.getMaxRows(), 1).getDisplayValues();
  for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) !== '') return i + 1;
  return 0;
}
function appendLog_(sh, rows) {
  if (!rows.length) return;
  const start = Math.max(LOG_FIRST_ROW, lastLogRow_(sh) + 1);
  if (start + rows.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 50);
  sh.getRange(start, LOG_COL, rows.length, LOG_HEAD.length).setValues(rows.map(function (r) { return r.map(function (x) { return safe_(String(x == null ? '' : x)); }); }));
}
function tabTitle_(flight, sectorNo, date, fallback) {
  const t = [flight, sectorNo ? 'S' + sectorNo : '', date].filter(function (x) { return String(x || '').trim(); }).join(' ').replace(/[\[\]\*\?\/\\:']/g, '-').trim();
  return (t || fallback).slice(0, 90);
}
function uniqueTitle_(ss, want, self) {
  let t = want, i = 2;
  while (true) {
    const ex = ss.getSheetByName(t);
    if ((!ex && t !== INDEX_SHEET) || (ex && self && ex.getSheetId() === self.getSheetId())) return t;
    t = want + ' (' + i++ + ')';
  }
}

// วันที่ในชีท (Date, 1-Jan-1987, 1/1/2530, 1987-01-01) → 'yyyy-mm-dd' หรือ ''
function iso_(y, m, d) {
  if (y > 2400) y -= 543;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}
function toIso_(v, tz) {
  if (isDate_(v)) { if (isNaN(v.getTime())) return ''; const p = Utilities.formatDate(v, tz, 'yyyy-MM-dd').split('-'); return iso_(+p[0], +p[1], +p[2]); }
  const s = str_(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return iso_(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-\s\/.]([A-Za-z]{3,9})\.?[-\s\/.](\d{4})$/.exec(s);
  if (m) { const i = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return i < 0 ? '' : iso_(+m[3], i + 1, +m[1]); }
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
  if (m) return iso_(+m[3], +m[2], +m[1]);
  return '';
}

// ---------- hashing (PBKDF2-HMAC-SHA256 แบบเดียวกับระบบ eadmin) ----------
function utf8_(s) { return Utilities.newBlob(String(s)).getBytes(); }
function sha256_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes); }
function hmac_(bytes, keyBytes) { return Utilities.computeHmacSha256Signature(bytes, keyBytes); }
function hex_(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += ((bytes[i] & 255) + 256).toString(16).slice(1); return s; }
function same_(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1)); return d === 0; }
function list_(bytes) { const o = []; for (let i = 0; i < bytes.length; i++) o.push(bytes[i]); return o; }
function pbkdf2_(password, salt, rounds) {
  const key = utf8_(password);
  let u = hmac_(list_(utf8_(salt)).concat([0, 0, 0, 1]), key);
  const out = list_(u);
  for (let i = 1; i < rounds; i++) { u = hmac_(u, key); for (let j = 0; j < out.length; j++) out[j] ^= u[j]; }
  return out;
}
function pwHash_(password, salt, rounds) { rounds = rounds || 5000; return 'pbkdf2-sha256$' + rounds + '$' + hex_(pbkdf2_(password, salt, rounds)); }
function pwCheck_(password, salt, stored) {
  const m = /^pbkdf2-sha256\$(\d{1,6})\$([0-9a-f]{64})$/.exec(str_(stored)), rounds = m ? +m[1] : 0;
  if (!m || !salt || rounds < 1000 || rounds > 200000) { pwHash_(password, 'no-such-account'); return false; }
  return same_(pwHash_(password, salt, rounds), m[0]);
}

// =====================================================================
// สภาพที่นั่ง จอ Monitor และ NOTE จาก Seat Plan 340 (For Admin)
// =====================================================================
function adminStatus_() {
  const id = fileId_(prop_(PROP.seat));
  if (!id) throw new Error('ยังไม่ได้ตั้งค่าไฟล์ Seat Plan 340 (For Admin)');
  const cache = CacheService.getScriptCache(), hit = cache.get('adminStatus');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* อ่านใหม่ */ } }
  const sh = SpreadsheetApp.openById(id).getSheetByName(ADMIN_MAP_SHEET);
  const last = sh.getLastRow();
  const v = sh.getRange(1, 1, last, 20).getDisplayValues();
  const cell = function (r, c) { return (r >= 1 && r <= last) ? String(v[r - 1][c - 1]).trim() : ''; };
  const out = {};
  for (let r = ADMIN_FIRST_ROW; r <= last; r++) {
    if (cell(r, 2) === 'Monitor') {
      for (let c = 3; c <= 20; c++) {
        const m = MON_TXT.indexOf(cell(r, c));
        if (m < 0) continue;
        const side = c <= 6 ? 'L' : (c <= 15 ? 'C' : 'R');
        out['MON-' + cell(r + 3, 2) + '-' + side] = { s: 0, m: m, note: cell(r + 1, c) };
      }
      continue;
    }
    for (let c = 3; c <= 20; c++) {
      const t = cell(r, c);
      if (!/^([A-K]|CC)$/.test(t)) continue;
      const st = cell(r + 1, c);
      if (st !== '' && SEAT_TXT.indexOf(st) < 0) continue;
      const sid = t === 'CC' ? 'CC' : cell(r, 2) + t;
      out[sid] = { s: Math.max(0, SEAT_TXT.indexOf(st)), m: Math.max(0, MON_TXT.indexOf(cell(r - 1, c))), note: cell(r + 2, c) };
    }
  }
  try { cache.put('adminStatus', JSON.stringify(out), 20); } catch (e) { /* ใหญ่เกิน cache ก็อ่านใหม่ทุกครั้ง */ }
  return out;
}

// =====================================================================
// รันครั้งเดียวจากหน้า Apps Script (เลือก setup แล้วกด เรียกใช้)
// =====================================================================
function setup() {
  const sp = PropertiesService.getScriptProperties();
  const put = function (k, v, isFile) {
    v = str_(v); if (!v) return;
    if (isFile) { const id = fileId_(v); if (!id) throw new Error('ลิงก์ไฟล์ไม่ถูกต้อง: ' + k); v = id; }
    sp.setProperty(k, v);
  };
  put(PROP.pin, SETUP.accessPin); put(PROP.cid, SETUP.googleClientId);
  put(PROP.seat, SETUP.adminSeatSheet, true); put(PROP.db, SETUP.loginDatabase, true);
  put(PROP.ulog, SETUP.userLogSheet, true); put(PROP.alog, SETUP.adminLogSheet, true);
  if (!sp.getProperty(PROP.secret)) sp.setProperty(PROP.secret, hex_(sha256_(utf8_(Utilities.getUuid() + Utilities.getUuid()))) + hex_(sha256_(utf8_(Utilities.getUuid()))));
  PROPS_ = null;
  try { CacheService.getScriptCache().removeAll(['cfg1', 'blk', 'dbh']); } catch (e) { try { CacheService.getScriptCache().remove('cfg1'); } catch (e2) { /* ไม่เป็นไร */ } }
  const missing = [];
  if (!prop_(PROP.pin)) missing.push('accessPin');
  [[PROP.seat, 'adminSeatSheet'], [PROP.db, 'loginDatabase'], [PROP.ulog, 'userLogSheet'], [PROP.alog, 'adminLogSheet']].forEach(function (x) { if (!prop_(x[0])) missing.push(x[1]); });
  if (missing.length) throw new Error('ยังไม่ได้กรอกใน SETUP: ' + missing.join(', '));

  const ss = SpreadsheetApp.getActive();
  const ix = readIndex_(ss);
  ix.rows.forEach(function (r) { const sh = sheetById_(ss, r.id); if (sh) ensureLayout_(sh); });
  CacheService.getScriptCache().remove('adminStatus');
  const s = adminStatus_();
  Logger.log('อ่านสภาพที่นั่งจากไฟล์ Seat Plan 340 (For Admin) ได้ ' + Object.keys(s).length + ' รายการ');
  Logger.log('อ่านรายชื่อจาก LOGIN DATABASE ได้ ' + loginDb_().length + ' แถว');
  logTab_(prop_(PROP.ulog), UL_HOME, UL_HOME_HEAD);
  logTab_(prop_(PROP.alog), AL_LOGIN, AL_LOGIN_HEAD);
  logTab_(prop_(PROP.alog), AL_ACT, AL_ACT_HEAD);
  lockSheet_(LOCK_USER); lockSheet_(LOCK_EMAIL);
  try { UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true }); } catch (e) { /* ขอสิทธิ์ UrlFetch ไว้ล่วงหน้า */ }
  Logger.log('ภารกิจในแท็บ ' + INDEX_SHEET + ': ' + ix.rows.length + ' · ยังไม่มีรหัสภารกิจ: ' + ix.rows.filter(function (r) { return !r.pw; }).length);
  Logger.log(prop_(PROP.cid) ? 'เปิดใช้ Sign in with Google แล้ว' : 'ยังไม่ได้ใส่ googleClientId: เข้าใช้งานได้โดยไม่ต้อง Sign in with Google (ประวัติจะไม่มีอีเมล)');
  Logger.log('setup เรียบร้อย ลบค่าที่กรอกในส่วน SETUP ออกได้ (ค่าเก็บใน Script Properties แล้ว)');
}
