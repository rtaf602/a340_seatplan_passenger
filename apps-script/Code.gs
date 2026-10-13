/**
 * Seat Plan A340 TEMPORARY FOR PASSENGER — Apps Script
 *
 * วางโค้ดนี้ใน Apps Script ของไฟล์ "Seat Plan A340 TEMPORARY FOR PASSENGER"
 *  - แท็บ "รายการภารกิจ"  = สารบัญภารกิจทั้งหมด (สร้างให้อัตโนมัติ)
 *  - 1 ภารกิจ = 1 แท็บ    = ข้อมูลภารกิจ + รายชื่อผู้โดยสารรายที่นั่ง (ซ้าย) + ประวัติการบันทึกของภารกิจนั้น (ขวา, คอลัมน์ J)
 *  - สภาพที่นั่งและ Monitor อ่านสดจากไฟล์ "Seat Plan 340 (For Admin)" แท็บ "ผังที่นั่ง"
 *
 * วิธีติดตั้ง: ดู README.md ใน repo
 */

// ---------- ตั้งค่า ----------
const ACCESS_PIN = '';   // ใส่รหัสเข้าใช้งานที่นี่ (ใน Apps Script เท่านั้น ห้ามใส่ใน GitHub) เว้นว่าง = ไม่ต้องใช้รหัส
const ADMIN_SHEET_ID = '1QPRDMdg3VUgmPG2tq4uS8MSzR4usahtAT0do6w4iysQ'; // Seat Plan 340 (For Admin)
const ADMIN_MAP_SHEET = 'ผังที่นั่ง';
const ADMIN_FIRST_ROW = 17;
const INDEX_SHEET = 'รายการภารกิจ';
const INDEX_HEAD = ['ID', 'ชื่อแท็บ', 'ชื่อภารกิจ', 'เที่ยวบินที่', 'Sector', 'วันที่บิน', 'ผู้โดยสาร', 'สร้างเมื่อ', 'แก้ไขล่าสุด', 'ผู้บันทึกล่าสุด'];

// ตำแหน่งในแท็บภารกิจ
const INFO = [ // [key, ป้าย, แถว]
  ['aircraft', 'ประเภทเครื่องบิน', 3],
  ['name', 'ชื่อภารกิจ', 4],
  ['flight', 'เที่ยวบินที่', 5],
  ['sector', 'Sector (IATA CODE)', 6],
  ['date', 'วันที่บิน', 7],
  ['gate', 'GATE', 8],
  ['time', 'BOARDING TIME', 9],
  ['note', 'หมายเหตุ Boarding Pass', 10]
];
const CREW_FRONT_ROW = 12, CREW_REAR_ROW = 13, LAST_SAVE_ROW = 14;
const PAX_HEAD_ROW = 16, PAX_FIRST_ROW = 17;
const PAX_HEAD = ['ที่นั่ง', 'โซน', 'ยศ (ไทย)', 'ชื่อ-สกุล (ไทย)', 'RANK (EN)', 'NAME (EN)', 'ผู้บันทึก', 'เวลาบันทึก'];
const LOG_COL = 10; // J
const LOG_HEAD = ['เวลา', 'ผู้บันทึก', 'ประเภท', 'ที่นั่ง / ช่อง', 'ค่าเดิม', 'ค่าใหม่'];
const LOG_FIRST_ROW = 3;

const SEAT_TXT = ['ปกติ', 'ขัดข้อง-ใช้ได้', 'ใช้ไม่ได้'];
const MON_TXT = ['จอปกติ', 'จอเสื่อม', 'จอเสีย'];
const TZ = 'Asia/Bangkok';

// ---------- Web API ----------
function doGet() {
  return json_({ ok: true, app: 'Seat Plan A340 Passenger API' });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    if (ACCESS_PIN && String(b.pin || '') !== ACCESS_PIN) return json_({ ok: false, error: 'pin' });
    if (b.action === 'missions') return json_(listMissions_());
    if (b.action === 'create') return json_(createMission_(b));
    if (b.action === 'load') return json_(loadMission_(b));
    if (b.action === 'save') return json_(saveMission_(b));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- ที่นั่งทั้งลำ (เรียงจากหัวไปท้าย) ----------
function seatList_() {
  const L = [['CC', 'MISSION COMMANDER']];
  const add = function (rows, letters, zone) {
    rows.forEach(function (r) { letters.split('').forEach(function (c) { L.push([r + c, zone]); }); });
  };
  add([1, 2], 'AEFK', 'FIRST CLASS');
  add([11, 12, 14, 15, 16], 'ABEFJK', 'BUSINESS CLASS');
  add([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41], 'ABDEFJK', 'PREMIUM ECONOMY');
  add([51, 52, 53], 'ABDEFGJK', 'ECONOMY');
  add([54, 55, 56], 'ABDEFJK', 'ECONOMY');
  add([57], 'ABJK', 'ECONOMY');
  return L; // 165 ที่นั่ง
}

// ---------- แท็บรายการภารกิจ ----------
function indexSheet_(ss) {
  let sh = ss.getSheetByName(INDEX_SHEET);
  if (!sh) {
    const first = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && first.getLastRow() === 0) { sh = first; sh.setName(INDEX_SHEET); }
    else sh = ss.insertSheet(INDEX_SHEET, 0);
  }
  if (sh.getRange(1, 1).getValue() !== INDEX_HEAD[0]) {
    sh.getRange(1, 1, 1, INDEX_HEAD.length).setValues([INDEX_HEAD]).setFontWeight('bold').setBackground('#dfeaf5');
    sh.setFrozenRows(1);
    sh.getRange('A:J').setNumberFormat('@');
  }
  return sh;
}

function sheetById_(ss, id) {
  id = Number(id);
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (all[i].getSheetId() === id) return all[i];
  return null;
}

function listMissions_() {
  const ss = SpreadsheetApp.getActive();
  const ix = indexSheet_(ss);
  const n = ix.getLastRow();
  const out = [];
  if (n > 1) {
    const rows = ix.getRange(2, 1, n - 1, INDEX_HEAD.length).getDisplayValues();
    rows.forEach(function (r) {
      const sh = sheetById_(ss, r[0]);
      if (!sh || !r[0]) return; // แท็บถูกลบไปแล้ว
      out.push({ id: r[0], tab: sh.getName(), name: r[2], flight: r[3], sector: r[4], date: r[5], pax: Number(r[6]) || 0, created: r[7], updated: r[8], by: r[9] });
    });
  }
  return { ok: true, missions: out.reverse(), sheetUrl: ss.getUrl() };
}

function createMission_(b) {
  const by = clean_(b.by, 60) || 'หน้าเว็บ';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const ix = indexSheet_(ss);
    const name = clean_(b.name, 200), flight = clean_(b.flight, 20).toUpperCase();
    const title = uniqueTitle_(ss, tabTitle_(flight, '', 'ภารกิจใหม่ ' + Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmm')), null);
    const sh = ss.insertSheet(title, ss.getSheets().length);
    setupMissionSheet_(sh);
    sh.getRange(INFO[1][2], 2).setValue(name);
    sh.getRange(INFO[2][2], 2).setValue(flight);
    const now = new Date(), nowTxt = fmtTime_(now);
    appendLog_(sh, [[nowTxt, by, 'เปิดภารกิจ', title, '', [name, flight].filter(String).join(' · ')]]);
    const id = String(sh.getSheetId());
    ix.appendRow([id, title, name, flight, '', '', '0', nowTxt, nowTxt, by]);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function setupMissionSheet_(sh) {
  sh.getRange('A:H').setNumberFormat('@');
  sh.getRange('J:O').setNumberFormat('@');
  sh.getRange(1, 1).setValue('SEAT PLAN A340 · ผังที่นั่งผู้โดยสาร').setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue('บันทึกจากหน้าเว็บ · ประวัติการบันทึกอยู่ที่คอลัมน์ J ด้านขวา').setFontColor('#566575');
  INFO.forEach(function (f) { sh.getRange(f[2], 1).setValue(f[1]).setFontWeight('bold'); });
  sh.getRange(INFO[0][2], 2).setValue('A340');
  sh.getRange(CREW_FRONT_ROW, 1).setValue('กั้นที่นั่งลูกเรือ หัวเครื่อง ถึงแถว').setFontWeight('bold');
  sh.getRange(CREW_REAR_ROW, 1).setValue('กั้นที่นั่งลูกเรือ ท้ายเครื่อง ถึงแถว').setFontWeight('bold');
  sh.getRange(LAST_SAVE_ROW, 1).setValue('SAVE ล่าสุด').setFontWeight('bold');
  sh.getRange(PAX_HEAD_ROW, 1, 1, PAX_HEAD.length).setValues([PAX_HEAD]).setFontWeight('bold').setBackground('#dfeaf5');
  const seats = seatList_().map(function (s) { return [s[0], s[1], '', '', '', '', '', '']; });
  sh.getRange(PAX_FIRST_ROW, 1, seats.length, 8).setValues(seats);
  sh.getRange(1, LOG_COL).setValue('ประวัติการบันทึก').setFontWeight('bold').setFontSize(12);
  sh.getRange(2, LOG_COL, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold').setBackground('#dfeaf5');
  sh.setFrozenRows(0);
  sh.setColumnWidth(1, 210); sh.setColumnWidth(2, 260); sh.setColumnWidths(3, 6, 130);
  sh.setColumnWidth(LOG_COL, 140); sh.setColumnWidth(LOG_COL + 3, 160); sh.setColumnWidths(LOG_COL + 4, 2, 260);
}

// ---------- โหลดภารกิจ ----------
function loadMission_(b) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetById_(ss, b.id);
  if (!sh) return { ok: false, error: 'no_mission' };
  const st = readMission_(sh);
  let status = {}, statusError = '';
  try { status = adminStatus_(); } catch (err) { statusError = String(err && err.message || err); }
  return {
    ok: true, id: String(sh.getSheetId()), tab: sh.getName(), info: st.info, crew: st.crew, pax: st.pax,
    lastSave: st.lastSave, status: status, statusError: statusError, history: readLog_(sh, 150), sheetUrl: ss.getUrl() + '#gid=' + sh.getSheetId()
  };
}

function readMission_(sh) {
  const top = sh.getRange(1, 1, LAST_SAVE_ROW, 2).getDisplayValues();
  const info = {};
  INFO.forEach(function (f) { info[f[0]] = top[f[2] - 1][1]; });
  info.aircraft = 'A340';
  const crew = { front: top[CREW_FRONT_ROW - 1][1], rear: top[CREW_REAR_ROW - 1][1] };
  let lastSave = null;
  try { lastSave = top[LAST_SAVE_ROW - 1][1] ? JSON.parse(top[LAST_SAVE_ROW - 1][1]) : null; } catch (err) { lastSave = { by: top[LAST_SAVE_ROW - 1][1] }; }
  const n = sh.getLastRow() - PAX_FIRST_ROW + 1;
  const pax = {}, rowOf = {};
  if (n > 0) {
    const rows = sh.getRange(PAX_FIRST_ROW, 1, n, 8).getDisplayValues();
    rows.forEach(function (r, i) {
      const id = String(r[0]).trim();
      if (!id) return;
      rowOf[id] = PAX_FIRST_ROW + i;
      if (r[2] || r[3] || r[4] || r[5]) pax[id] = { rt: r[2], nt: r[3], re: r[4], ne: r[5], by: r[6], at: r[7] };
    });
  }
  return { info: info, crew: crew, pax: pax, rowOf: rowOf, lastSave: lastSave };
}

function readLog_(sh, max) {
  const last = lastLogRow_(sh);
  if (last < LOG_FIRST_ROW) return [];
  const from = Math.max(LOG_FIRST_ROW, last - max + 1);
  return sh.getRange(from, LOG_COL, last - from + 1, LOG_HEAD.length).getDisplayValues().reverse();
}

// ---------- บันทึก ----------
function saveMission_(b) {
  const by = clean_(b.by, 60) || 'หน้าเว็บ';
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = sheetById_(ss, b.id);
    if (!sh) return { ok: false, error: 'no_mission' };
    const cur = readMission_(sh);
    const now = new Date(), nowTxt = fmtTime_(now);
    const log = [], conflicts = [];
    let n = 0;

    // ข้อมูลภารกิจ (ประเภทเครื่องบินล็อกเป็น A340)
    const info = b.info || {};
    INFO.forEach(function (f) {
      if (f[0] === 'aircraft' || !(f[0] in info)) return;
      let v = clean_(info[f[0]], f[0] === 'name' || f[0] === 'note' ? 300 : 40);
      if (['flight', 'sector', 'gate', 'date'].indexOf(f[0]) >= 0) v = v.toUpperCase();
      if (v === cur.info[f[0]]) return;
      sh.getRange(f[2], 2).setValue(v);
      log.push([nowTxt, by, 'ข้อมูลภารกิจ', f[1], cur.info[f[0]], v]);
      cur.info[f[0]] = v; n++;
    });

    // กั้นที่นั่งลูกเรือ
    if (b.crew) {
      [['front', CREW_FRONT_ROW, 'หัวเครื่อง'], ['rear', CREW_REAR_ROW, 'ท้ายเครื่อง']].forEach(function (c) {
        const v = clean_(b.crew[c[0]], 10).toUpperCase();
        if (v === cur.crew[c[0]]) return;
        sh.getRange(c[1], 2).setValue(v);
        log.push([nowTxt, by, 'กั้นที่นั่งลูกเรือ (ADMIN)', c[2], cur.crew[c[0]] ? 'ถึงแถว ' + cur.crew[c[0]] : 'ไม่กั้น', v ? 'ถึงแถว ' + v : 'ไม่กั้น']);
        n++;
      });
    }

    // ผู้โดยสารรายที่นั่ง (ตรวจว่ามีคนอื่นบันทึกทับก่อนหรือไม่)
    const pax = Array.isArray(b.pax) ? b.pax.slice(0, 400) : [];
    pax.forEach(function (p) {
      const id = String(p.id || '');
      const row = cur.rowOf[id];
      if (!row) return;
      const old = cur.pax[id] || { rt: '', nt: '', re: '', ne: '' };
      const base = p.base || { rt: '', nt: '', re: '', ne: '' };
      const val = {
        rt: clean_(p.val && p.val.rt, 30), nt: clean_(p.val && p.val.nt, 120),
        re: clean_(p.val && p.val.re, 30).toUpperCase(), ne: clean_(p.val && p.val.ne, 120).toUpperCase()
      };
      if (samePax_(old, val)) return;
      if (!samePax_(old, base)) { conflicts.push({ id: id, now: old }); return; }
      const empty = !val.rt && !val.nt && !val.re && !val.ne;
      sh.getRange(row, 3, 1, 6).setValues([[val.rt, val.nt, val.re, val.ne, empty ? '' : by, empty ? '' : nowTxt]]);
      log.push([nowTxt, by, empty ? 'ลบผู้โดยสาร' : (paxTxt_(old) ? 'แก้ไขผู้โดยสาร' : 'เพิ่มผู้โดยสาร'), id, paxTxt_(old), paxTxt_(val)]);
      if (empty) delete cur.pax[id]; else cur.pax[id] = val;
      n++;
    });

    appendLog_(sh, log);
    const lastSave = { by: by, at: now.toISOString(), n: n };
    if (n) sh.getRange(LAST_SAVE_ROW, 2).setValue(JSON.stringify(lastSave));

    // ตั้งชื่อแท็บตามเที่ยวบินและวันที่
    const want = tabTitle_(cur.info.flight, cur.info.date, '');
    if (want && want !== sh.getName()) {
      const t = uniqueTitle_(ss, want, sh);
      if (t !== sh.getName()) sh.setName(t);
    }
    updateIndex_(ss, sh, cur, nowTxt, by);
    return { ok: true, saved: n, conflicts: conflicts, at: now.toISOString(), lastSave: n ? lastSave : cur.lastSave };
  } finally { lock.releaseLock(); }
}

function updateIndex_(ss, sh, cur, nowTxt, by) {
  const ix = indexSheet_(ss);
  const id = String(sh.getSheetId());
  const n = ix.getLastRow();
  let row = 0;
  if (n > 1) {
    const ids = ix.getRange(2, 1, n - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) { row = i + 2; break; }
  }
  const count = Object.keys(cur.pax).length;
  const vals = [id, sh.getName(), cur.info.name, cur.info.flight, cur.info.sector, cur.info.date, String(count)];
  if (!row) { ix.appendRow(vals.concat([nowTxt, nowTxt, by])); return; }
  ix.getRange(row, 1, 1, 7).setValues([vals]);
  ix.getRange(row, 9, 1, 2).setValues([[nowTxt, by]]);
}

function samePax_(a, b) {
  a = a || {}; b = b || {};
  return String(a.rt || '') === String(b.rt || '') && String(a.nt || '') === String(b.nt || '') &&
    String(a.re || '') === String(b.re || '') && String(a.ne || '') === String(b.ne || '');
}
function paxTxt_(p) {
  if (!p) return '';
  const th = [p.rt, p.nt].filter(String).join(' '), en = [p.re, p.ne].filter(String).join(' ');
  return [th, en].filter(String).join(' / ');
}

function lastLogRow_(sh) {
  const max = sh.getMaxRows();
  const v = sh.getRange(1, LOG_COL, max, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) !== '') return i + 1;
  return 0;
}
function appendLog_(sh, rows) {
  if (!rows.length) return;
  const start = Math.max(LOG_FIRST_ROW, lastLogRow_(sh) + 1);
  if (start + rows.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 50);
  sh.getRange(start, LOG_COL, rows.length, LOG_HEAD.length).setValues(rows.map(function (r) { return r.map(String); }));
}

function fmtTime_(d) { return Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm:ss'); }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function tabTitle_(flight, date, fallback) {
  const t = [flight, date].filter(function (x) { return String(x || '').trim(); }).join(' ').replace(/[\[\]\*\?\/\\:']/g, '-').trim();
  return (t || fallback).slice(0, 90);
}
function uniqueTitle_(ss, want, self) {
  let t = want, i = 2;
  while (true) {
    const ex = ss.getSheetByName(t);
    if (!ex || (self && ex.getSheetId() === self.getSheetId())) return t;
    if (t === INDEX_SHEET) { t = want + ' (' + i++ + ')'; continue; }
    t = want + ' (' + i++ + ')';
  }
}

// ---------- สภาพที่นั่งและ Monitor จาก Seat Plan 340 (For Admin) ----------
function adminStatus_() {
  const sh = SpreadsheetApp.openById(ADMIN_SHEET_ID).getSheetByName(ADMIN_MAP_SHEET);
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
        out['MON-' + cell(r + 3, 2) + '-' + side] = { s: 0, m: m };
      }
      continue;
    }
    for (let c = 3; c <= 20; c++) {
      const t = cell(r, c);
      if (!/^([A-K]|CC)$/.test(t)) continue;
      const st = cell(r + 1, c);
      if (st !== '' && SEAT_TXT.indexOf(st) < 0) continue;
      const id = t === 'CC' ? 'CC' : cell(r, 2) + t;
      out[id] = { s: Math.max(0, SEAT_TXT.indexOf(st)), m: Math.max(0, MON_TXT.indexOf(cell(r - 1, c))) };
    }
  }
  return out;
}

/** รันครั้งเดียวจาก Apps Script เพื่ออนุญาตสิทธิ์อ่านไฟล์ Admin และสร้างแท็บรายการภารกิจ */
function setup() {
  indexSheet_(SpreadsheetApp.getActive());
  const s = adminStatus_();
  Logger.log('อ่านสภาพที่นั่งจากไฟล์ Admin ได้ ' + Object.keys(s).length + ' รายการ');
}
