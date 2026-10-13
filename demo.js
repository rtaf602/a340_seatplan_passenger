/* โหมดทดลอง (?demo=1) — จำลอง Apps Script API ในเบราว์เซอร์ (localStorage) ไม่เชื่อม Google Sheet
 * รับรหัสผ่านอะไรก็ได้ที่ไม่ว่าง สภาพที่นั่ง/จอเป็นข้อมูลตัวอย่าง */
(function(){
'use strict';
var KEY='pax-a340-demo-db';
var INFO=['name','flight','sector','date','gate','time','note'];
var LABEL={name:'ชื่อภารกิจ',flight:'เที่ยวบินที่',sector:'Sector (IATA CODE)',date:'วันที่บิน',gate:'GATE',time:'BOARDING TIME',note:'หมายเหตุ Boarding Pass'};
var STATUS={CC:{s:2,m:0},'33D':{s:1,m:0},'56E':{s:2,m:0},'12A':{s:0,m:2},'MON-36-C':{s:0,m:1}};
function db(){try{return JSON.parse(localStorage.getItem(KEY)||'null')||{seq:100,missions:{}}}catch(e){return {seq:100,missions:{}}}}
function put(d){localStorage.setItem(KEY,JSON.stringify(d))}
function now(){var t=new Date(Date.now()+7*3600e3),p=function(n){return String(n).padStart(2,'0')};
  return p(t.getUTCDate())+'/'+p(t.getUTCMonth()+1)+'/'+t.getUTCFullYear()+' '+p(t.getUTCHours())+':'+p(t.getUTCMinutes())+':'+p(t.getUTCSeconds())}
function txt(p){if(!p)return '';var th=[p.rt,p.nt].filter(Boolean).join(' '),en=[p.re,p.ne].filter(Boolean).join(' ');return [th,en].filter(Boolean).join(' / ')}
function same(a,b){a=a||{};b=b||{};return ['rt','nt','re','ne'].every(function(k){return String(a[k]||'')===String(b[k]||'')})}
function tab(m){return [m.info.flight,m.info.date].filter(Boolean).join(' ')||m.tab}
function handle(b){
  if(!b.pin)return {ok:false,error:'pin'};
  var d=db(),by=String(b.by||'').trim()||'หน้าเว็บ',t=now();
  if(b.action==='missions'){
    return {ok:true,missions:Object.keys(d.missions).map(function(id){var m=d.missions[id];
      return {id:id,tab:tab(m),name:m.info.name,flight:m.info.flight,sector:m.info.sector,date:m.info.date,pax:Object.keys(m.pax).length,created:m.created,updated:m.updated,by:m.by}}).reverse()};
  }
  if(b.action==='create'){
    var id=String(++d.seq),m={info:{aircraft:'A340',name:b.name||'',flight:(b.flight||'').toUpperCase(),sector:'',date:'',gate:'',time:'',note:''},crew:{front:'',rear:''},pax:{},history:[],lastSave:null,created:t,updated:t,by:by,tab:'ภารกิจใหม่ '+id};
    m.history.unshift([t,by,'เปิดภารกิจ',m.tab,'',[m.info.name,m.info.flight].filter(Boolean).join(' · ')]);
    d.missions[id]=m;put(d);return {ok:true,id:id};
  }
  var mm=d.missions[b.id];if(!mm)return {ok:false,error:'no_mission'};
  if(b.action==='load')return {ok:true,id:b.id,tab:tab(mm),info:mm.info,crew:mm.crew,pax:mm.pax,lastSave:mm.lastSave,status:STATUS,statusError:'',history:mm.history.slice(0,150),sheetUrl:''};
  if(b.action==='save'){
    var log=[],conf=[],n=0;
    INFO.forEach(function(k){if(!(k in (b.info||{})))return;var v=String(b.info[k]||'').trim();if(/flight|sector|gate|date/.test(k))v=v.toUpperCase();
      if(v===mm.info[k])return;log.push([t,by,'ข้อมูลภารกิจ',LABEL[k],mm.info[k],v]);mm.info[k]=v;n++});
    if(b.crew)[['front','หัวเครื่อง'],['rear','ท้ายเครื่อง']].forEach(function(c){var v=b.crew[c[0]]||'';if(v===mm.crew[c[0]])return;
      log.push([t,by,'กั้นที่นั่งลูกเรือ (ADMIN)',c[1],mm.crew[c[0]]?'ถึงแถว '+mm.crew[c[0]]:'ไม่กั้น',v?'ถึงแถว '+v:'ไม่กั้น']);mm.crew[c[0]]=v;n++});
    (b.pax||[]).forEach(function(p){var old=mm.pax[p.id],val={rt:p.val.rt,nt:p.val.nt,re:String(p.val.re).toUpperCase(),ne:String(p.val.ne).toUpperCase()};
      if(same(old,val))return;if(!same(old,p.base)){conf.push({id:p.id,now:old||{}});return}
      var empty=!val.rt&&!val.nt&&!val.re&&!val.ne;
      log.push([t,by,empty?'ลบผู้โดยสาร':(old?'แก้ไขผู้โดยสาร':'เพิ่มผู้โดยสาร'),p.id,txt(old),txt(val)]);
      if(empty)delete mm.pax[p.id];else{val.by=by;val.at=t;mm.pax[p.id]=val}n++});
    mm.history=log.reverse().concat(mm.history);
    var at=new Date().toISOString();if(n)mm.lastSave={by:by,at:at,n:n};mm.updated=t;mm.by=by;put(d);
    return {ok:true,saved:n,conflicts:conf,at:at,lastSave:mm.lastSave};
  }
  return {ok:false,error:'unknown_action'};
}
window.DEMO_API=function(b){return new Promise(function(ok){setTimeout(function(){ok(handle(b))},120)})};
})();
