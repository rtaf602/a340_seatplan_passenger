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
  sessionHours: 12,        // เข้าหน้ารายการแล้วใช้ได้นานเท่านี้ (ปิด / รีเฟรชหน้าเว็บต้องใส่ใหม่ เพราะหน้าเว็บไม่เก็บไว้)
  missionHours: 12,        // ใส่รหัสภารกิจแล้วใช้ได้นานเท่านี้ (ออกจากภารกิจแล้วกลับเข้าใหม่ต้องใส่ใหม่)
  adminHours: 2,           // Login หน้า ADMIN ใช้ได้นานเท่านี้
  pinMaxFails: 10, pinLockMinutes: 15,   // รหัสเว็บไซต์: ผิด 10 ครั้ง พัก 15 นาที ผิดอีก 10 ครั้ง บล็อก (ปลดในแท็บ LOCKED EMAILS)
  mpwMaxFails: 5, mpwLockMinutes: 15,
  loginMaxFails: 5, loginPauseMinutes: 60,
  minMissionPw: 4,
  loginTab: 'DATABASE LOGIN',
  roles: ['Admin', 'Editor', 'Viewer']
};
const MSG = {
  login: 'ข้อมูลไม่ถูกต้อง หรือบัญชียังไม่พร้อมใช้งาน ให้ติดต่อ Admin',
  pin: 'รหัสผ่านไม่ถูกต้อง',
  pinLocked: 'ใส่รหัสผ่านผิดหลายครั้ง ให้รอ ' + OPT.pinLockMinutes + ' นาทีแล้วลองใหม่',
  pinBlocked: 'บัญชี Google นี้ใส่รหัสผ่านผิดหลายครั้งและถูกบล็อก ให้ติดต่อ Admin',
  mpw: 'รหัสภารกิจไม่ถูกต้อง',
  mpwLocked: 'ใส่รหัสภารกิจผิดหลายครั้ง ให้รอ ' + OPT.mpwLockMinutes + ' นาทีแล้วลองใหม่',
  session: 'หมดเวลาใช้งาน ให้ใส่รหัสผ่านเข้าใช้งานใหม่',
  mission: 'ต้องใส่รหัสภารกิจใหม่',
  admin: 'หมดเวลาของหน้า ADMIN ให้ Login ใหม่',
  google: 'ต้อง Sign in with Google ก่อนเข้าใช้งาน',
  closed: 'ภารกิจนี้ปิดแล้ว ดูได้อย่างเดียว ถ้าต้องการแก้ไขให้เปิดภารกิจอีกครั้ง',
  busy: 'ระบบกำลังบันทึกจากเครื่องอื่น ลองอีกครั้งใน 2-3 วินาที'
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
const AL_LOGIN = 'HISTORY LOGIN DATA', AL_LOGIN_HEAD = ['Timestamp', 'Email', 'Username', 'Event', 'ใช้สำหรับ', 'ภารกิจ', 'รายละเอียด'];
const AL_ACT = 'ADMIN ACTIVITY', AL_ACT_HEAD = ['Timestamp', 'Email', 'Username', 'ภารกิจ', 'Action', 'Detail'];
const AL_LOCK = 'LOCKED USERS', AL_LOCK_HEAD = ['Username', 'สถานะ', 'จำนวนครั้งที่ผิด', 'พักถึงเวลา', 'รอบ', 'อัปเดตล่าสุด', 'วิธีปลดบล็อก'];
const AL_PINLOCK = 'LOCKED EMAILS', AL_PINLOCK_HEAD = ['Email', 'สถานะ', 'จำนวนครั้งที่ผิด', 'พักถึงเวลา', 'รอบ', 'อัปเดตล่าสุด', 'วิธีปลดบล็อก'];
// ล็อก 2 แบบใช้กติกาเดียวกัน: ผิดครบ max ครั้ง พัก pause นาที แล้วผิดอีก max ครั้ง บล็อกจนแอดมินแก้สถานะเป็น ACTIVE
const LOCK_USER = { tab: AL_LOCK, head: AL_LOCK_HEAD, max: function () { return OPT.loginMaxFails; }, pause: function () { return OPT.loginPauseMinutes; } };
const LOCK_PIN = { tab: AL_PINLOCK, head: AL_PINLOCK_HEAD, max: function () { return OPT.pinMaxFails; }, pause: function () { return OPT.pinLockMinutes; } };

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
// CREW ZONE: หัวเครื่อง = แถวแรกถึงแถวที่เลือก, ท้ายเครื่อง = แถวที่เลือกถึงแถวสุดท้าย (ห้อง Mission Commander ไม่ถูกกั้น)
function crewRows_(c) {
  const set = {}, fi = ROWS.indexOf(String(c.front || '')), ri = ROWS.indexOf(String(c.rear || ''));
  let i;
  if (fi > 0) for (i = 1; i <= fi; i++) set[ROWS[i]] = 1;
  if (ri > 0) for (i = ri; i < ROWS.length; i++) set[ROWS[i]] = 1;
  return set;
}

// =====================================================================
// Web API (POST แบบ text/plain)
// =====================================================================
function doGet() { return json_({ ok: true, app: 'Seat Plan A340 Passenger API' }); }

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const ctx = { b: b, now: Date.now() };
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

const ACTIONS = {
  config: function () { return { ok: true, googleClientId: prop_(PROP.cid) || '', pinRequired: true }; },
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
  'admin.save': opAdminSave_
};

// ---------- Script Properties ----------
let PROPS_ = null;
function props_() { if (!PROPS_) PROPS_ = PropertiesService.getScriptProperties().getProperties(); return PROPS_; }
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
  if (!s) throw err_('session', MSG.session);
  ctx.email = s.e || ''; return s;
}
function pwTag_(pw) { return hex_(sha256_(utf8_('mpw|' + pw))).slice(0, 12); }
function missionAuth_(ctx, ix) {
  const t = unsign_(ctx.b.mt, 'm', ctx.now);
  if (!t || t.m !== ix.id || t.v !== pwTag_(ix.pw)) throw err_('mission_token', MSG.mission);
  return t;
}
function adminAuth_(ctx, ix) {
  const t = unsign_(ctx.b.at, 'a', ctx.now);
  if (!t || t.m !== ix.id) throw err_('admin_token', MSG.admin);
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
  const pin = prop_(PROP.pin);
  if (!pin) throw err_('config', 'ยังไม่ได้ตั้งรหัสเข้าใช้งาน (accessPin) ใน setup()');
  const ok = same_(String(b.pin || ''), pin);
  if (email) {
    // Sign in with Google แล้ว: นับผิดต่ออีเมลในแท็บ LOCKED EMAILS (ไฟล์ Admin Page)
    withLock_(function () {
      const st = lockState_(email, ctx.now, LOCK_PIN);
      if (st.status === 'BLOCKED') { userLog_(ctx, null, email, '', 'ใส่รหัสเข้าใช้งาน (ถูกบล็อก)', 'ให้แอดมินแก้สถานะเป็น ACTIVE ในแท็บ ' + AL_PINLOCK); throw err_('pin_blocked', MSG.pinBlocked); }
      if (st.status === 'PAUSED') { userLog_(ctx, null, email, '', 'ใส่รหัสเข้าใช้งาน (ถูกพัก)', 'พักถึง ' + fmtTime_(new Date(st.until))); throw err_('pin_locked', 'ใส่รหัสผ่านผิดหลายครั้ง ให้รอถึง ' + fmtTime_(new Date(st.until)).slice(11, 16) + ' น. แล้วลองใหม่'); }
      if (ok) { if (st.row && (st.dirty || st.fails || st.round || st.status !== 'ACTIVE')) lockOk_(email, st, ctx.now, LOCK_PIN); return; }
      const r = lockFail_(email, st, ctx.now, LOCK_PIN);
      userLog_(ctx, null, email, '', 'ใส่รหัสเข้าใช้งานผิด', 'ครั้งที่ ' + r.fails + (r.round ? ' (หลังพัก)' : '') + (r.status === 'PAUSED' ? ' · พัก ' + OPT.pinLockMinutes + ' นาที' : r.status === 'BLOCKED' ? ' · บล็อก (ปลดในแท็บ ' + AL_PINLOCK + ')' : ''));
    });
    if (!ok) { Utilities.sleep(400); throw err_('pin', MSG.pin); }
  } else {
    // ยังไม่ได้ตั้ง Sign in with Google: ไม่มีอีเมลให้นับ จึงพักชั่วคราวรวมทุกคน (ไม่บล็อกถาวร)
    const cache = CacheService.getScriptCache(), key = 'pf:anon';
    const fails = Number(cache.get(key)) || 0;
    if (fails >= OPT.pinMaxFails) throw err_('pin_locked', MSG.pinLocked);
    if (!ok) {
      cache.put(key, String(fails + 1), OPT.pinLockMinutes * 60);
      userLog_(ctx, null, '', '', 'ใส่รหัสเข้าใช้งานผิด', 'ครั้งที่ ' + (fails + 1));
      Utilities.sleep(400);
      throw err_('pin', MSG.pin);
    }
  }
  userLog_(ctx, null, email, '', 'เข้าใช้งาน', email ? 'Sign in with Google' : 'ไม่ได้ Sign in with Google');
  return { ok: true, s: sign_({ k: 's', e: email, x: ctx.now + OPT.sessionHours * 3600e3 }), email: email };
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

function opMissions_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const out = readIndex_(ss).rows.filter(function (r) { return !!sheetById_(ss, r.id); }).map(function (r) {
    return { id: r.id, tab: r.tab, name: r.name, flight: r.flight, sectorNo: r.sectorNo, route: r.route, date: r.date, pax: Number(r.pax) || 0,
      created: r.created, updated: r.updated, by: r.by, status: r.status, hasPw: !!r.pw, closeInfo: r.closeInfo };
  });
  if (b.first) userLog_(ctx, null, ctx.email, '', 'เปิดหน้ารายการภารกิจ', out.length + ' ภารกิจ');
  return { ok: true, missions: out.reverse() };
}

function opCreate_(ctx, b) {
  session_(ctx);
  const by = clean_(b.by, 60);
  const info = b.info || {}, pw = String(b.mpw || '');
  if (pw.length < OPT.minMissionPw || pw.length > 60) throw err_('bad_request', 'รหัสภารกิจต้องมีอย่างน้อย ' + OPT.minMissionPw + ' ตัว');
  return withLock_(function () {
    const ss = SpreadsheetApp.getActive();
    const p = credCheck_(ctx, b.cred, 'เปิดภารกิจใหม่', null);   // ต้อง Login ด้วย LOGIN DATABASE เหมือนหน้า ADMIN
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
    return { ok: true, id: id, mt: sign_({ k: 'm', m: id, e: ctx.email, v: pwTag_(pw), x: ctx.now + OPT.missionHours * 3600e3 }) };
  });
}

function opOpen_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const m = missionCtx_(ctx, ss, b.id);
  if (!m.ix.pw) throw err_('no_password', 'ภารกิจนี้ยังไม่ได้ตั้งรหัสภารกิจ ให้กด “เปลี่ยนรหัสภารกิจ” เพื่อตั้งรหัสก่อน');
  const cache = CacheService.getScriptCache(), key = 'mf:' + m.ix.id + ':' + hex_(sha256_(utf8_(ctx.email || 'anon'))).slice(0, 16);
  const fails = Number(cache.get(key)) || 0;
  if (fails >= OPT.mpwMaxFails) { userLog_(ctx, m.ix, ctx.email, '', 'ใส่รหัสภารกิจ (ถูกพัก)', 'ใส่ผิดเกิน ' + OPT.mpwMaxFails + ' ครั้ง'); throw err_('mpw_locked', MSG.mpwLocked); }
  if (!same_(String(b.mpw || ''), m.ix.pw)) {
    cache.put(key, String(fails + 1), OPT.mpwLockMinutes * 60);
    userLog_(ctx, m.ix, ctx.email, '', 'ใส่รหัสภารกิจผิด', 'ครั้งที่ ' + (fails + 1));
    Utilities.sleep(400);
    throw err_('mpw', MSG.mpw);
  }
  cache.remove(key);
  userLog_(ctx, m.ix, ctx.email, '', 'เข้าภารกิจ', missionLabel_(m.ix));
  return { ok: true, mt: sign_({ k: 'm', m: m.ix.id, e: ctx.email, v: pwTag_(m.ix.pw), x: ctx.now + OPT.missionHours * 3600e3 }) };
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
  sh.getRange(CREW_FRONT_ROW, 1).setValue('กั้นที่นั่งลูกเรือ หัวเครื่อง ถึงแถว').setFontWeight('bold');
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
  if (b.at) { try { adminAuth_(ctx, m.ix); isAdmin = true; } catch (e) { isAdmin = false; } }
  const st = readMission_(m.sh);
  let status = {}, statusError = '';
  try { status = adminStatus_(); } catch (err) { statusError = String(err && err.message || err); }
  // รายชื่อลูกเรือเห็นได้เฉพาะคนที่ Login ADMIN: ซ่อนประวัติการเพิ่ม / แก้ / ลบลูกเรือจากผู้ใช้ทั่วไป
  const history = readLog_(m.sh, 300).filter(function (r) { return isAdmin || !/ลูกเรือ/.test(r[3]) || /^กั้นที่นั่งลูกเรือ/.test(r[3]); })
    .slice(0, 150).map(function (r) { return [r[0], r[2], r[3], r[4], r[5], r[6]]; });
  return {
    ok: true, id: m.ix.id, tab: m.sh.getName(), mstatus: m.ix.status, closeInfo: m.ix.closeInfo,
    info: st.info, crew: st.crew, pax: st.pax, crewPax: isAdmin ? st.crewPax : undefined, admin: isAdmin ? ctx.admin : '',
    lastSave: st.lastSave, status: status, statusError: statusError, history: history
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
  const lastSave = n ? { by: by, at: now.toISOString(), n: n, e: ctx.email } : cur.lastSave;
  if (n) m.sh.getRange(LAST_SAVE_ROW, 2).setValue(JSON.stringify(lastSave));
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

// ตรวจ 4 อย่างพร้อมกันทุกครั้ง ไม่บอกว่าผิดช่องไหน ผิดติดกัน 5 ครั้งพัก 60 นาที อีก 5 ครั้งบล็อกจนแอดมินปลด
function credCheck_(ctx, cred, purpose, ix) {
  cred = cred || {};
  const username = str_(cred.u).toLowerCase(), password = String(cred.p == null ? '' : cred.p);
  const mission = ix ? missionLabel_(ix) : '';
  const fail = function (event, detail) {
    loginLog_(ctx, username, event, purpose, mission, detail || '');
    Utilities.sleep(600);
    return err_('login_failed', MSG.login);
  };
  if (!username || !password || username.length > 60 || password.length > 200) { pwHash_(password || 'x', 'no-such-account'); throw fail('LOGIN_FAIL', 'กรอกไม่ครบ'); }
  const people = loginDb_();
  const who = people.filter(function (p) { return p.username.toLowerCase() === username; });
  const known = who.length === 1;
  const p = known && canLogin_(who[0]) && people.filter(function (q) { return q !== who[0] && q.idGov && q.idGov === who[0].idGov; }).length === 0 ? who[0] : null;
  const lock = known ? lockState_(username, ctx.now) : null;
  if (lock && (lock.status === 'BLOCKED' || (lock.status === 'PAUSED' && lock.until > ctx.now))) {
    pwHash_(password, 'no-such-account');
    throw fail(lock.status === 'BLOCKED' ? 'LOGIN_BLOCKED' : 'LOGIN_PAUSED', lock.status === 'BLOCKED' ? 'Username ถูกบล็อก' : 'Username ถูกพักถึง ' + fmtTime_(new Date(lock.until)));
  }
  const okPw = pwCheck_(password, p ? p.salt : '', p ? p.hash : '');
  const okId = !!p && same_(p.idGov, digits_(cred.idGov));
  const okBirth = !!p && same_(p.birth, str_(cred.birth));
  if (!(okPw && okId && okBirth) || !p || expired_(p)) {
    let ev = 'LOGIN_FAIL', detail = 'ข้อมูลไม่ถูกต้อง';
    if (p && okPw && okId && okBirth) detail = 'เลยวันสิ้นสุดการใช้งาน';
    if (lock) {
      const r = lockFail_(username, lock, ctx.now);
      detail += ' · ผิดครั้งที่ ' + r.fails + (r.round ? ' (หลังพัก)' : '');
      if (r.status === 'PAUSED') { ev = 'LOGIN_PAUSED'; detail += ' · พัก ' + OPT.loginPauseMinutes + ' นาที'; }
      if (r.status === 'BLOCKED') { ev = 'LOGIN_BLOCKED'; detail += ' · บล็อก (ให้แอดมินแก้สถานะเป็น ACTIVE ในแท็บ ' + AL_LOCK + ')'; }
    } else if (!known) detail = 'ไม่พบ Username';
    throw fail(ev, detail);
  }
  if (lock && (lock.row && (lock.dirty || lock.fails || lock.round || lock.status !== 'ACTIVE'))) lockOk_(username, lock, ctx.now);
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
    const p = credCheck_(ctx, b.cred, 'ปิดภารกิจ', m.ix);
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
    if (!m.ix.pw || !same_(String(b.mpw || ''), m.ix.pw)) {
      loginLog_(ctx, str_(b.cred && b.cred.u).toLowerCase(), 'LOGIN_FAIL', 'เปิดภารกิจอีกครั้ง', missionLabel_(m.ix), 'รหัสภารกิจไม่ถูกต้อง');
      Utilities.sleep(600);
      throw err_('login_failed', MSG.login);
    }
    const p = credCheck_(ctx, b.cred, 'เปิดภารกิจอีกครั้ง', m.ix);
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
    adminAct_(ctx, p.username, m.ix, 'เข้าหน้า ADMIN', '');
    return { ok: true, at: sign_({ k: 'a', u: p.username, m: m.ix.id, e: ctx.email, x: ctx.now + OPT.adminHours * 3600e3 }), user: p.username, hours: OPT.adminHours };
  });
}
function opAdminLogout_(ctx, b) {
  session_(ctx);
  const ss = SpreadsheetApp.getActive();
  const m = missionCtx_(ctx, ss, b.id);
  const t = unsign_(b.at, 'a', ctx.now);
  if (t && t.m === m.ix.id) { loginLog_(ctx, t.u, 'LOGOUT', 'ADMIN PAGE', missionLabel_(m.ix), clean_(b.why, 80)); adminAct_(ctx, t.u, m.ix, 'ออกจากหน้า ADMIN', clean_(b.why, 80)); }
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
      const nc = { front: clean_(b.crew.front, 4), rear: clean_(b.crew.rear, 4) };
      if (nc.front && ROWS.indexOf(nc.front) < 1) nc.front = '';
      if (nc.rear && ROWS.indexOf(nc.rear) < 1) nc.rear = '';
      const fi = ROWS.indexOf(nc.front), ri = ROWS.indexOf(nc.rear);
      if (fi > 0 && ri > 0 && fi >= ri) throw err_('bad_request', 'กั้นจากหัวเครื่องและท้ายเครื่องซ้อนกัน');
      [['front', CREW_FRONT_ROW, 'หัวเครื่อง'], ['rear', CREW_REAR_ROW, 'ท้ายเครื่อง']].forEach(function (c) {
        if (nc[c[0]] === cur.crew[c[0]]) return;
        m.sh.getRange(c[1], 2).setValue(nc[c[0]]);
        log.push([nowTxt, ctx.email, by, 'กั้นที่นั่งลูกเรือ (ADMIN)', c[2], cur.crew[c[0]] ? 'ถึงแถว ' + cur.crew[c[0]] : 'ไม่กั้น', nc[c[0]] ? 'ถึงแถว ' + nc[c[0]] : 'ไม่กั้น']);
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
  return out;
}
function lockOk_(key, st, now, kind) { st.status = 'ACTIVE'; st.fails = 0; st.round = 0; st.until = 0; lockWrite_(key, st, now, kind); }
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
function userLog_(ctx, ix, email, by, action, detail) { userLogRows_(ctx, ix, [[new Date(ctx.now), email || '', by || '', action, detail || '']]); }
function userLogRows_(ctx, ix, rows) {
  if (!rows.length) return;
  quietly_(function () {
    const fid = prop_(PROP.ulog);
    if (!fid) return;
    let sh;
    if (!ix) sh = logTab_(fid, UL_HOME, UL_HEAD);
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
    sh.getRange(start, 1, rows.length, UL_HEAD.length).setValues(rows.map(function (r) { return [r[0]].concat(r.slice(1).map(safe_)); }));
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
  try { return fn(); } finally { lock.releaseLock(); }
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
  logTab_(prop_(PROP.ulog), UL_HOME, UL_HEAD);
  logTab_(prop_(PROP.alog), AL_LOGIN, AL_LOGIN_HEAD);
  logTab_(prop_(PROP.alog), AL_ACT, AL_ACT_HEAD);
  lockSheet_(LOCK_USER); lockSheet_(LOCK_PIN);
  try { UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true }); } catch (e) { /* ขอสิทธิ์ UrlFetch ไว้ล่วงหน้า */ }
  Logger.log('ภารกิจในแท็บ ' + INDEX_SHEET + ': ' + ix.rows.length + ' · ยังไม่มีรหัสภารกิจ: ' + ix.rows.filter(function (r) { return !r.pw; }).length);
  Logger.log(prop_(PROP.cid) ? 'เปิดใช้ Sign in with Google แล้ว' : 'ยังไม่ได้ใส่ googleClientId: เข้าใช้งานได้โดยไม่ต้อง Sign in with Google (ประวัติจะไม่มีอีเมล)');
  Logger.log('setup เรียบร้อย ลบค่าที่กรอกในส่วน SETUP ออกได้ (ค่าเก็บใน Script Properties แล้ว)');
}
