/* ตั้งค่าการเชื่อมต่อ Google Sheet
 * API_URL   = URL ของ Apps Script Web App (ลงท้ายด้วย /exec) ได้จากขั้นตอน Deploy ใน README.md
 * SHEET_URL = ลิงก์ไฟล์ Seat Plan A340 TEMPORARY FOR PASSENGER (ใช้เมื่อเซิร์ฟเวอร์ไม่ได้ส่งลิงก์มา)
 * ห้ามใส่รหัสผ่านในไฟล์นี้ repo เป็น public ให้ตั้งรหัสใน Apps Script เท่านั้น
 */
window.SEATPLAN_CONFIG = {
  API_URL: '',
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1J9o1sZHvwqYpWhzIZitlQyIw88H4iLtucF1iRXQC7IQ/edit?usp=sharing'
};
