/* Seat Plan A340 · Passenger
 * Gate: access PIN (+ Sign in with Google when the server has a client ID) → mission list → mission password → seat plan.
 * Nothing secret is kept in the browser: the server checks every password and returns signed tokens. The tokens are kept
 * for this tab only (sessionStorage): reloading keeps them, closing the tab drops them. All tokens share one clock
 * (90 minutes, "ใช้งานต่อ" adds 90). Each tab has its own window id; an email / username works in one window at a time.
 * Drafts (unsaved edits) are kept on this device until SAVE.
 * Seat and monitor condition (with NOTE) come from "Seat Plan 340 (For Admin)" through the Apps Script. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function showDlg(d){if(!d.open){if(d.showModal)d.showModal();else d.setAttribute('open','')}}
function hideDlg(d){if(d.close)d.close();else d.removeAttribute('open')}
function anyDialogOpen(){return !!document.querySelector('dialog[open]')}

var CFG=window.SEATPLAN_CONFIG||{};
var API=String(CFG.API_URL||'').trim();
var sess='',email='',clientId='',gsiCred='';
var wid='',clockX=0,srvOff=0;          // window id of this tab · end of the one clock (server ms) · server time minus this device
var mtok={};                           // mission id -> mission token
var atok='',admUser='',admMission='';  // ADMIN token for the open mission
var AUTH='sp-a340-auth',WIDK='sp-a340-w',restoreView=false;
function sstore(k,v){try{if(v===undefined)return sessionStorage.getItem(k);if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch(e){}return null}
function newWid(){var a=new Uint8Array(12);if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(a);else for(var i=0;i<a.length;i++)a[i]=Math.random()*256|0;
  return 'w'+[].map.call(a,function(b){return ('0'+b.toString(16)).slice(-2)}).join('')}
/* tokens of this tab: kept across reloads, gone when the tab closes */
function saveAuth(){if(!sess){sstore(AUTH,null);return}
  sstore(AUTH,JSON.stringify({s:sess,e:email,x:clockX,o:srvOff,mt:mtok,at:atok,au:admUser,am:admMission,vt:vtok,view:view}))}
function restoreAuth(){var a=null;try{a=JSON.parse(sstore(AUTH)||'null')}catch(e){a=null}
  if(!a||!a.s||!(a.x>Date.now()+(a.o||0)))return;
  sess=a.s;email=a.e||'';clockX=a.x;srvOff=a.o||0;mtok=a.mt||{};atok=a.at||'';admUser=a.au||'';admMission=a.am||'';vtok=a.vt||'';restoreView=a.view==='admin'}
function srvNow(){return Date.now()+srvOff}
function hm(ms){var b=bkk(new Date(ms));return p2(b.h)+':'+p2(b.m)}
function rawApi(body){body.w=wid;
  return fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(function(r){return r.json()});
}
function api(body){body.s=sess;return rawApi(body)}

/* ---------- aircraft layout (nose to tail) ---------- */
function rows(nums,layout,mon){return nums.map(function(n){return {n:n,g:layout,mon:mon}})}
var ZONES=[
 {key:'CC',name:'MISSION COMMANDER',title:'Mission Commander',items:[{cc:true}]},
 {key:'A',name:'FIRST CLASS',title:'First Class',items:rows([1,2],['A','','EF','','K'],true)},
 {key:'B',name:'BUSINESS CLASS',title:'Business Class',items:rows([11,12,14,15,16],['AB','EF','JK'],true)},
 {key:'C',name:'PREMIUM ECONOMY',title:'Premium Economy',
  items:[{ovh:'31',g:['AB','DEF','JK']}].concat(rows([31,32,33,34,35],['AB','DEF','JK'],false),[{ovh:'36',g:['AB','DEF','JK']}],rows([36,37,38,39,40,41],['AB','DEF','JK'],false))},
 {key:'D',name:'ECONOMY',title:'Economy',
  items:[{ovh:'51',g:['AB','DEFG','JK']}].concat(rows([51,52,53],['AB','DEFG','JK'],false),rows([54,55,56],['AB','DEF_','JK'],false),rows([57],['AB','____','JK'],false))}
];
var SEATS=[],SEAT={},ROWS=[];
ZONES.forEach(function(z){z.items.forEach(function(it){
  if(it.cc){ROWS.push('CC');SEATS.push('CC');SEAT.CC={zone:'CC',row:'CC',mon:true};return}
  if(it.ovh)return;
  ROWS.push(String(it.n));
  it.g.join('').replace(/_/g,'').split('').forEach(function(L){var id=it.n+L;SEATS.push(id);SEAT[id]={zone:z.key,row:String(it.n),mon:it.mon}});
})});
function zoneOf(k){for(var i=0;i<ZONES.length;i++)if(ZONES[i].key===k)return ZONES[i];return null}
var INFO_KEYS=['sectorNo','name','flight','route','date','gate','time','note'];
var INFO_LABEL={sectorNo:'Sector',name:'ชื่อภารกิจ',flight:'เที่ยวบินที่',route:'เส้นทางบิน',date:'วันที่บิน',gate:'GATE',time:'BOARDING TIME',note:'หมายเหตุ Boarding Pass'};
var UPPER={flight:1,route:1,gate:1,date:1};
var MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
var MON_TH=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/* Thai rank abbreviation -> English abbreviation (auto-filled, still editable) */
var RANKS=[['พล.อ.อ.','ACM'],['พล.อ.ท.','AM'],['พล.อ.ต.','AVM'],['น.อ.','GP.CAPT.'],['น.ท.','WG.CDR.'],['น.ต.','SQN.LDR.'],
 ['ร.อ.','FLT.LT.'],['ร.ท.','FLG.OFF.'],['ร.ต.','PLT.OFF.'],['พ.อ.อ.','FS1'],['พ.อ.ท.','FS2'],['พ.อ.ต.','FS3'],['จ.อ.','SGT.'],['จ.ท.','CPL.'],
 ['จ.ต.','LAC'],['พลฯ','AMN.'],['นนอ.','A/CDT.'],['นาย','MR.'],['นาง','MRS.'],['นางสาว','MS.'],['ดร.','DR.']];
function rankEn(th){var t=String(th||'').replace(/\s+/g,'').replace(/หญิง$/,'');
  for(var i=0;i<RANKS.length;i++)if(RANKS[i][0]===t)return RANKS[i][1];return ''}

/* ---------- people ---------- */
var PF=['rt','ft','lt','re','fe','le'];
var EMPTY={rt:'',ft:'',lt:'',re:'',fe:'',le:''};
function norm(p){p=p||EMPTY;var o={};PF.forEach(function(k){o[k]=String(p[k]||'')});return o}
function isEmpty(p){p=norm(p);return PF.every(function(k){return !p[k].trim()})}
function same(a,b){a=norm(a);b=norm(b);return PF.every(function(k){return a[k]===b[k]})}
function thFull(p){return [p.rt,p.ft,p.lt].filter(Boolean).join(' ')}
function enFull(p){return [p.re,p.fe,p.le].filter(Boolean).join(' ')}
function cap(s){return String(s||'').toLowerCase().replace(/(^|[\s\-'])([a-z])/g,function(m,a,b){return a+b.toUpperCase()})}
function thInitial(s){s=String(s||'').trim();var i=0;while(i<s.length&&/[เแโใไ]/.test(s.charAt(i)))i++;return s.charAt(i)||''}
/* ชื่อย่อบนที่นั่ง: มานะ พ. (มีชื่อไทยใช้ไทย) หรือ Mana P. */
function shortName(p){if(!p)return '';
  var ft=String(p.ft||'').trim(),lt=String(p.lt||'').trim(),fe=String(p.fe||'').trim(),le=String(p.le||'').trim();
  if(ft){var c=thInitial(lt);return ft+(c?' '+c+'.':'')}
  if(fe)return cap(fe)+(le?' '+le.charAt(0).toUpperCase()+'.':'');
  return lt||cap(le)}

/* ---------- state ---------- */
var M=null;            // last loaded (= saved) mission from the server
var D=null;            // drafts of this device: {info,infoBase,pax,crew,crewPax}
var useSaved=false;    // PREVIEW / PDF / boarding pass read the last SAVE only
var view='pax';        // 'pax' or 'admin'
var curId=null;
function draftKey(id){return 'pax-a340-draft2-'+id}
function loadDraft(id){var d=null;try{d=JSON.parse(localStorage.getItem(draftKey(id))||'null')}catch(e){}
  d=d||{};return {info:d.info||{},infoBase:d.infoBase||{},pax:d.pax||{},crew:d.crew||null,crewBase:d.crewBase||null,crewPax:d.crewPax||{}}}
function persistDraft(){if(!curId||!D)return;try{
  if(!Object.keys(D.info).length&&!Object.keys(D.pax).length&&!D.crew&&!Object.keys(D.crewPax).length)localStorage.removeItem(draftKey(curId));
  else localStorage.setItem(draftKey(curId),JSON.stringify(D))}catch(e){}}
function savedInfo(k){return k==='aircraft'?'A340':String((M&&M.info&&M.info[k])||'')}
function getInfo(k){if(!useSaved&&D&&k in D.info)return D.info[k];return savedInfo(k)}
function savedCrew(){return {front:String((M&&M.crew&&M.crew.front)||''),rear:String((M&&M.crew&&M.crew.rear)||'')}}
function getCrew(){return (!useSaved&&view==='admin'&&D&&D.crew)?D.crew:savedCrew()}
function getPax(id){var p=(!useSaved&&view==='pax'&&D&&D.pax[id])?D.pax[id].val:(M&&M.pax[id]);return p&&!isEmpty(p)?norm(p):null}
function getCrewPax(id){if(!M||!M.crewPax)return null;var p=(!useSaved&&view==='admin'&&D&&D.crewPax[id])?D.crewPax[id].val:M.crewPax[id];return p&&!isEmpty(p)?norm(p):null}
function paxPending(id){return !useSaved&&view==='pax'&&!!(D&&D.pax[id])}
function crewPending(id){return !useSaved&&view==='admin'&&!!(D&&D.crewPax[id])}
function status(id){var s=M&&M.status&&M.status[id];return {s:s?s.s|0:0,m:s?s.m|0:0,note:s&&s.note?String(s.note):''}}
function closed(){return !!(M&&M.mstatus==='CLOSED')}
function cleanDraft(){if(!D)return;
  INFO_KEYS.forEach(function(k){if(k in D.info&&D.info[k]===savedInfo(k)){delete D.info[k];delete D.infoBase[k]}});
  if(D.crew){var c=savedCrew();if(D.crew.front===c.front&&D.crew.rear===c.rear){D.crew=null;D.crewBase=null}}
  Object.keys(D.pax).forEach(function(id){if(!SEAT[id]||same(D.pax[id].val,M&&M.pax[id]))delete D.pax[id]});
  if(M&&M.crewPax)Object.keys(D.crewPax).forEach(function(id){if(!SEAT[id]||same(D.crewPax[id].val,M.crewPax[id]))delete D.crewPax[id]});
}
function pending(mode){mode=mode||view;if(!D)return {info:[],pax:[],crew:false,crewPax:[],n:0};
  if(mode==='admin'){var cp=SEATS.filter(function(id){return D.crewPax[id]});return {info:[],pax:[],crew:!!D.crew,crewPax:cp,n:(D.crew?1:0)+cp.length}}
  var info=INFO_KEYS.filter(function(k){return k in D.info}),pax=SEATS.filter(function(id){return D.pax[id]});
  return {info:info,pax:pax,crew:false,crewPax:[],n:info.length+pax.length}}

/* crew zone front: '' = none · 'CC' = Mission Commander room only · 'CC-16' = MC room to row 16 · '16' = row 1 to row 16
   rear = chosen row .. last row */
function crewFront(v){v=String(v||'').trim().toUpperCase();if(!v)return null;if(v==='CC')return {cc:true,end:0};
  var m=/^CC-(.+)$/.exec(v),i=ROWS.indexOf(m?m[1]:v);return i>0?{cc:!!m,end:i}:null}
function crewRows(c){var set={},f=crewFront(c.front),ri=ROWS.indexOf(c.rear),i;
  if(f)for(i=f.cc?0:1;i<=f.end;i++)set[ROWS[i]]=1;
  if(ri>0)for(i=ri;i<ROWS.length;i++)set[ROWS[i]]=1;
  return set}
function isCrew(id,set){return !!(set||crewRows(getCrew()))[SEAT[id].row]}

/* seat counts: CREW ZONE first, then passengers. A seat that cannot be used still counts as free (a name can go there
   when the plane is full); freeBad says how many of the free seats are such seats. crewFree = CREW ZONE seats without a crew name */
var SK=['t','crew','occ','bad','free','freeBad','crewOcc','crewFree'];
function zoneStats(){var set=crewRows(getCrew()),T={},sum={};
  function blank(){var o={};SK.forEach(function(k){o[k]=0});return o}
  sum=blank();ZONES.forEach(function(z){T[z.key]=blank()});
  SEATS.forEach(function(id){var z=T[SEAT[id].zone],bad=status(id).s===2;z.t++;
    if(isCrew(id,set)){z.crew++;if(getCrewPax(id))z.crewOcc++;else z.crewFree++;return}
    if(bad)z.bad++;
    if(getPax(id))z.occ++;else{z.free++;if(bad)z.freeBad++}});
  ZONES.forEach(function(z){var v=T[z.key];SK.forEach(function(k){sum[k]+=v[k]})});
  T.sum=sum;return T}

/* ---------- time (Thai local time, UTC+7) ---------- */
function p2(n){return String(n).padStart(2,'0')}
function bkk(d){var t=new Date((d?d.getTime():Date.now())+7*3600e3);
  return {y:t.getUTCFullYear(),M:t.getUTCMonth()+1,d:t.getUTCDate(),h:t.getUTCHours(),m:t.getUTCMinutes()}}
function fmtTH(iso){if(!iso)return '';var d=new Date(iso);if(isNaN(d))return String(iso);var b=bkk(d);
  return b.d+' '+MON[b.M-1]+' '+String(b.y).slice(2)+' / '+p2(b.h)+':'+p2(b.m)+' TH-LT'}
/* "13/10/2026 20:20:05" (from the sheet) -> "13 OCT 26 / 20:20 TH-LT" */
function fmtSheet(s){var m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(String(s||''));
  return m?(+m[1])+' '+MON[+m[2]-1]+' '+m[3].slice(2)+' / '+p2(+m[4])+':'+m[5]+' TH-LT':String(s||'')}
function fileName(kind,ext){var b=bkk(),fl=String(useSavedInfo('flight')||'').toUpperCase().replace(/[\\\/:*?"<>|]+/g,'-').trim()||'NO-FLIGHT';
  return String(b.y).slice(2)+p2(b.M)+p2(b.d)+'_'+p2(b.h)+'.'+p2(b.m)+' TH-LT_'+fl+'_Seat Plan A340 ('+kind+').'+(ext||'pdf')}
function useSavedInfo(k){var u=useSaved;useSaved=true;try{return getInfo(k)}finally{useSaved=u}}
/* "1 OCT 26" -> sortable number 261001 */
function dateNum(v){var m=/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2})$/.exec(String(v||'').toUpperCase().trim());
  if(!m)return 0;var i=MON.indexOf(m[2]);return i<0?0:(+m[3])*10000+(i+1)*100+(+m[1])}

/* ---------- toast / ask / warn ---------- */
var toastT=null;
function toast(msg,bad){var t=$('toast');t.textContent=msg;t.className='toast show'+(bad?' bad':'');clearTimeout(toastT);toastT=setTimeout(function(){t.className='toast'},5000)}
var askCb=null;
function ask(title,msg,yes,cb,noCb){$('aTitle').textContent=title;$('aMsg').textContent=msg;$('aYes').textContent=yes;$('aYes').hidden=!yes;$('aNo').textContent=yes?'ยกเลิก':'ปิด';askCb={yes:cb,no:noCb};showDlg($('ask'))}
$('aNo').addEventListener('click',function(){hideDlg($('ask'));var f=askCb;askCb=null;if(f&&f.no)f.no()});
$('aYes').addEventListener('click',function(){hideDlg($('ask'));var f=askCb;askCb=null;if(f&&f.yes)f.yes()});
$('ask').addEventListener('cancel',function(){var f=askCb;askCb=null;if(f&&f.no)f.no()});
var warnCb=null,warnMode='pax';
function guard(label,fn){
  var n=pending().n;if(!n){fn();return}
  warnMode=view;
  $('wMsg').textContent='มีการแก้ไข '+n+' รายการที่ยังไม่ได้ SAVE ถ้ากด '+label+' ต่อ ข้อมูลที่แสดงจะเป็นค่าก่อนกด SAVE (SAVE ครั้งล่าสุด) ไม่รวมรายการที่แก้ไขไว้';
  $('wGo').textContent=label+' ต่อ (ค่าก่อน SAVE)';warnCb=fn;showDlg($('warn'));
}
$('wNo').addEventListener('click',function(){hideDlg($('warn'));warnCb=null});
$('wGo').addEventListener('click',function(){hideDlg($('warn'));var f=warnCb;warnCb=null;if(f)f()});
$('wSave').addEventListener('click',function(){hideDlg($('warn'));var f=warnCb;warnCb=null;(warnMode==='admin'?doAdminSave():doSave()).then(function(ok){if(ok&&f&&!pending().n)f()})});

/* ---------- date selects (D / MON / YY or Thai birth date) ---------- */
function dateSel(box,opt){
  var s=box.querySelectorAll('select'),dD=s[0],dM=s[1],dY=s[2];
  function ph(sel,t){var o=new Option(t,'');if(opt.anyLabel){o.textContent=t}else{o.disabled=true;o.hidden=true}sel.appendChild(o)}
  ph(dD,opt.ph[0]);for(var i=1;i<=31;i++)dD.appendChild(new Option(String(i),String(i)));
  ph(dM,opt.ph[1]);(opt.months||MON).forEach(function(m,i){dM.appendChild(new Option(m,String(i)))});
  ph(dY,opt.ph[2]);opt.years.forEach(function(y){dY.appendChild(new Option(y[1],String(y[0])))});
  function paint(){[dD,dM,dY].forEach(function(x){x.classList.toggle('empty',!x.value)})}
  [dD,dM,dY].forEach(function(x){x.addEventListener('change',function(){paint();if(opt.onChange)opt.onChange()})});
  paint();
  return {
    parts:function(){return {d:dD.value,m:dM.value,y:dY.value}},
    complete:function(){return !!(dD.value&&dM.value&&dY.value)},
    blank:function(){return !dD.value&&!dM.value&&!dY.value},
    set:function(d,m,y){if(y&&!dY.querySelector('option[value="'+y+'"]'))dY.appendChild(new Option(opt.yearText?opt.yearText(y):String(y),String(y)));dD.value=d||'';dM.value=m||'';dY.value=y||'';paint()},
    selects:[dD,dM,dY]
  };
}
function yy(){return bkk().y%100}
function flightYears(){var y=yy(),o=[];for(var j=y-1;j<=y+5;j++)o.push([j,p2(j)]);return o}
function flightText(ds){var p=ds.parts();return ds.complete()?(+p.d)+' '+MON[+p.m]+' '+p2(+p.y):''}
function setFlight(ds,v){var m=/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2})$/.exec(String(v||'').toUpperCase().trim());
  if(m&&MON.indexOf(m[2])>=0)ds.set(String(+m[1]),String(MON.indexOf(m[2])),String(+m[3]));else ds.set('','','')}

/* =====================================================================
   Gate: access PIN (+ Sign in with Google)
   ===================================================================== */
function showGate(err){
  $('pageMissions').hidden=true;$('pagePlan').hidden=true;
  $('gate').hidden=false;$('gateErr').textContent=err||'';$('gateErr').hidden=!err;$('gateErr').classList.remove('info');$('gateBtn').disabled=false;
  $('gatePin').value='';$('gsiBox').hidden=!clientId;$('pinHead').hidden=!clientId;
  if(clientId){gsiCred='';$('gsiOk').hidden=true;gsiStep();initGsi()}
  else setTimeout(function(){$('gatePin').focus()},50);
}
function hideGate(){$('gate').hidden=true}
var gsiLoaded=null;
function jwtEmail(t){try{var b=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(b)))).email||''}catch(e){return ''}}
/* step 1 (Google) -> step 2 (PIN): highlight the step the user is on */
function gsiStep(){var ok=!!gsiCred;
  $('gsiBox').classList.toggle('done',ok);$('gNum1').textContent=ok?'✓':'1.';
}
function initGsi(){
  if(!gsiLoaded)gsiLoaded=new Promise(function(ok,no){var s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=ok;s.onerror=no;document.head.appendChild(s)});
  gsiLoaded.then(function(){
    google.accounts.id.initialize({client_id:clientId,callback:function(r){gsiCred=r.credential||'';
      var e=jwtEmail(gsiCred);$('gsiOk').textContent=e?'Sign in แล้ว: '+e:'Sign in แล้ว';$('gsiOk').hidden=!gsiCred;if(!oldApi)$('gateErr').hidden=true;gsiStep();$('gatePin').focus()},
      auto_select:true,cancel_on_tap_outside:false});
    $('gsiBtn').textContent='';
    google.accounts.id.renderButton($('gsiBtn'),{theme:'outline',size:'large',text:'signin_with',shape:'rectangular',width:300});
  },function(){$('gateErr').textContent='โหลดปุ่ม Sign in with Google ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วโหลดหน้าใหม่';$('gateErr').hidden=false});
}
$('gateBtn').addEventListener('click',function(){
  if(oldApi){$('gateErr').textContent=OLD_API_MSG;$('gateErr').hidden=false;return}
  var p=$('gatePin').value.trim();if(!p){$('gatePin').focus();return}
  if(clientId&&!gsiCred){$('gateErr').textContent='ขั้นที่ 1: กดปุ่ม Sign in with Google ก่อน แล้วจึงใส่รหัสผ่าน';$('gateErr').hidden=false;return}
  $('gateBtn').disabled=true;
  var gateFail=function(msg){$('gateErr').textContent=msg;$('gateErr').hidden=false;$('gateBtn').disabled=false;$('gatePin').value='';$('gatePin').focus()};
  rawApi({action:'enter',pin:p,credential:gsiCred}).then(function(res){
    if(res&&res.error==='takeover_wait'){waitTakeover(res,{},gotSession,gateFail);return}
    if(!res||!res.ok){
      if(res&&res.error==='google'){gsiCred='';$('gsiOk').hidden=true;gsiStep()}
      gateFail((res&&res.message)||'เข้าใช้งานไม่สำเร็จ');return}
    gotSession(res);
  },function(){gateFail('ติดต่อระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง')});
});
function gotSession(res){sess=res.s;email=res.email||'';gsiCred='';clockX=res.x||0;if(res.now)srvOff=res.now-Date.now();
  expWarned=0;expDismissed=0;saveAuth();hideGate();route(true);startPing()}
$('gatePin').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('gateBtn').click()}});
/* errors any request can get: the access session ran out, the mission password is needed again, ADMIN timed out */
function authFail(res){
  if(!res)return false;
  if(res.error==='session'||res.error==='kicked'||res.error==='blocked_out'){forceOut(res.message||'หมดเวลาใช้งาน ให้เข้าสู่ระบบใหม่');return true}
  if(res.error==='mission_token'&&curId){mpwChanged();return true}
  if(res.error==='admin_token'){var was=view==='admin';dropAdmin();setView('pax');if(was||res.message)ask('ออกจากหน้า ADMIN',res.message||'หมดเวลาของหน้า ADMIN','',null);return true}
  return false;
}
/* out of the system (time up, logged in from another window, blocked, Logout): tokens go, drafts stay on this device */
function forceOut(msg){
  stopTk();sess='';mtok={};atok='';admUser='';admMission='';vtok='';clockX=0;sstore(AUTH,null);
  [].forEach.call(document.querySelectorAll('dialog[open]'),function(d){hideDlg(d)});
  curId=null;M=null;D=null;view='pax';ML=[];$('saveBar').hidden=true;
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  showGate(msg);
}

/* =====================================================================
   Mission list page
   ===================================================================== */
var ML=[],mtab='open',pendingOpen=null,vtok='';   // vtok: Login ดูภารกิจที่เสร็จสิ้น / ทั้งหมด (memory only)
var rFrom=dateSel($('rFrom'),{ph:['วัน','เดือน','ปี'],years:flightYears(),anyLabel:true,onChange:renderMissions});
var rTo=dateSel($('rTo'),{ph:['วัน','เดือน','ปี'],years:flightYears(),anyLabel:true,onChange:renderMissions});
function rangeNum(ds,end){var p=ds.parts();if(!p.y)return 0;return (+p.y)*10000+((p.m===''?(end?11:0):+p.m)+1)*100+(p.d?+p.d:(end?31:1))}
$('rClear').addEventListener('click',function(){rFrom.set('','','');rTo.set('','','');renderMissions()});
function setTab(v){mtab=v;[].forEach.call(document.querySelectorAll('#mtabs button'),function(x){var on=x.dataset.v===v;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on))});renderMissions()}
[].forEach.call(document.querySelectorAll('#mtabs button'),function(b){b.addEventListener('click',function(){
  var v=b.dataset.v;if(v==='open'||vtok){setTab(v);return}
  // ภารกิจที่เสร็จสิ้น / ทั้งหมด ต้อง Login ด้วย LOGIN DATABASE ก่อน
  credDialog({title:'Login เพื่อดู'+(v==='closed'?'ภารกิจที่เสร็จสิ้นเรียบร้อย':'ภารกิจทั้งหมด'),sub:'ยืนยันตัวตนด้วยข้อมูลใน LOGIN DATABASE',yes:'Login',
    submit:function(d){return api({action:'missions.unlock',cred:d.cred})},
    wait:{},done:function(res){vtok=res.vt;saveAuth();toast('Login แล้ว ดูภารกิจทั้งหมดได้ถึง '+hm(clockX)+' น.');loadMissions().then(function(){setTab(v)})}});
})});
function showMissions(first){
  leavePlan();
  $('pagePlan').hidden=true;$('pageMissions').hidden=false;document.title='A340 Passenger Seat Plan';
  paintAcct();
  return loadMissions(first);
}
function loadMissions(first){
  return api({action:'missions',first:!!first,vt:vtok||undefined}).then(function(res){
    if(authFail(res))return;
    if(!res||!res.ok)throw new Error(res&&res.message||'load');
    if(vtok&&!res.canView){vtok='';saveAuth();if(mtab!=='open')setTab('open');ask('ดูภารกิจที่เสร็จสิ้น / ภารกิจทั้งหมด',res.viewWhy||'หมดเวลาการดูภารกิจที่เสร็จสิ้น ให้ Login ใหม่','',null)}
    ML=res.missions||[];$('noticeM').hidden=true;renderMissions();
    if(pendingOpen){var m=ML.filter(function(x){return x.id===pendingOpen})[0];pendingOpen=null;if(m)openMission(m)}
  }).catch(function(){$('noticeM').hidden=false;$('noticeM').textContent='ดึงรายการภารกิจไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วกด “โหลดใหม่”'});
}
function renderMissions(){
  var from=rangeNum(rFrom,false),to=rangeNum(rTo,true);
  var inRange=ML.filter(function(m){if(!from&&!to)return true;var n=dateNum(m.date);if(!n)return false;return (!from||n>=from)&&(!to||n<=to)});
  var c={open:0,closed:0,all:inRange.length};inRange.forEach(function(m){if(m.status==='CLOSED')c.closed++;else c.open++});
  $('cOpen').textContent=c.open;$('cClosed').textContent=vtok?c.closed:'🔒';$('cAll').textContent=vtok?c.all:'🔒';
  var list=inRange.filter(function(m){return mtab==='all'||(mtab==='closed')===(m.status==='CLOSED')});
  list.sort(function(a,b){return (dateNum(b.date)-dateNum(a.date))||(+b.id-+a.id)});
  var host=$('mlist');host.textContent='';
  list.forEach(function(m){
    var card=el('div','mcard'+(m.status==='CLOSED'?' closed':''));card.tabIndex=0;card.setAttribute('role','button');
    var top=el('div','top');top.appendChild(el('span','fl',m.flight||'(ยังไม่ระบุเที่ยวบิน)'));
    var chips=el('span','chips');
    if(m.status==='CLOSED')chips.appendChild(el('span','chip done','เสร็จสิ้นแล้ว'));
    if(!m.hasPw)chips.appendChild(el('span','chip warn','ยังไม่ได้ตั้งรหัส'));
    top.appendChild(chips);card.appendChild(top);
    var l1=el('div','sec');l1.appendChild(el('b',null,m.sectorNo?'Sector '+m.sectorNo:'Sector -'));l1.append('  '+(m.route||'-')+'  ·  '+(m.date||'-'));card.appendChild(l1);
    card.appendChild(el('div','nm',m.name||'(ยังไม่ระบุชื่อภารกิจ)'));
    card.appendChild(el('span','px','ผู้โดยสาร '+(m.pax||0)+' คน'));
    card.appendChild(el('div','meta','แก้ไขล่าสุด '+fmtSheet(m.updated)));
    var acts=el('div','macts');
    var bOpen=el('button','btn pri sm','เข้าภารกิจ');bOpen.type='button';bOpen.addEventListener('click',function(e){e.stopPropagation();openMission(m)});
    var bPw=el('button','btn sm',m.hasPw?'เปลี่ยนรหัสภารกิจ':'ตั้งรหัสภารกิจ');bPw.type='button';bPw.addEventListener('click',function(e){e.stopPropagation();credFlow('pw',m)});
    var bCl=el('button','btn sm'+(m.status==='CLOSED'?'':' danger'),m.status==='CLOSED'?'เปิดภารกิจอีกครั้ง':'ปิดภารกิจ');bCl.type='button';
    bCl.addEventListener('click',function(e){e.stopPropagation();credFlow(m.status==='CLOSED'?'reopen':'close',m)});
    acts.appendChild(bOpen);acts.appendChild(bPw);acts.appendChild(bCl);card.appendChild(acts);
    card.addEventListener('click',function(){openMission(m)});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target===card)openMission(m)});
    host.appendChild(card);
  });
  var e=$('mempty');e.hidden=list.length>0;
  e.textContent=ML.length?'ไม่มีภารกิจในหมวดและห้วงเวลาที่เลือก':'ยังไม่มีภารกิจ กด “+ เปิดภารกิจใหม่” เพื่อเริ่ม';
}
$('bReloadM').addEventListener('click',function(){loadMissions()});

/* ----- mission password ----- */
var mpwFor=null;
function openMission(m){
  if(!m.hasPw){ask('ยังไม่ได้ตั้งรหัสภารกิจ','ภารกิจนี้สร้างก่อนมีรหัสภารกิจ ให้กด “ตั้งรหัสภารกิจ” (ต้องใช้ Username, Password, เลขบัตรข้าราชการ และวันเดือนปีเกิด) แล้วจึงเข้าภารกิจได้','ตั้งรหัสภารกิจ',function(){credFlow('pw',m)});return}
  if(mtok[m.id]){location.hash='m='+encodeURIComponent(m.id);return}
  mpwFor=m;$('mpwTitle').textContent='ใส่รหัสภารกิจ';$('mpwNo').textContent='ยกเลิก';$('mpwYes').textContent='เข้าภารกิจ';$('mpwSub').textContent=[m.flight,m.sectorNo?'Sector '+m.sectorNo:'',m.route,m.date].filter(Boolean).join(' · ')+(m.name?' — '+m.name:'');
  $('mpwIn').value='';$('mpwErr').hidden=true;$('mpwYes').disabled=false;showDlg($('mpwDlg'));setTimeout(function(){$('mpwIn').focus()},50);
}
$('mpwNo').addEventListener('click',function(){var m=mpwFor;hideDlg($('mpwDlg'));mpwFor=null;
  if(m&&m.changed){if(curId)delete mtok[curId];saveAuth();location.hash='';toast('ออกจากภารกิจแล้ว สิ่งที่กรอกไว้แต่ยังไม่ได้ SAVE ยังอยู่ในเครื่องนี้')}});
$('mpwDlg').addEventListener('cancel',function(e){if(mpwFor&&mpwFor.changed)e.preventDefault()});
/* 14. the mission password was changed while this mission is open: ask for the new one here, drafts stay */
function mpwChanged(){
  if(!curId||($('mpwDlg').open&&mpwFor&&mpwFor.changed))return;
  if($('mpwDlg').open)hideDlg($('mpwDlg'));
  mpwFor={id:curId,changed:true};
  $('mpwTitle').textContent='รหัสภารกิจถูกเปลี่ยน';
  $('mpwSub').textContent='รหัสภารกิจถูกเปลี่ยน โปรดติดต่อ ADMIN เพื่อขอรหัสภารกิจใหม่ แล้วกรอกด้านล่างเพื่อใช้งานต่อ · สิ่งที่กรอกไว้แต่ยังไม่ได้ SAVE ยังอยู่';
  $('mpwNo').textContent='ออกจากภารกิจ';$('mpwYes').textContent='ใช้งานต่อ';
  $('mpwIn').value='';$('mpwErr').hidden=true;$('mpwYes').disabled=false;showDlg($('mpwDlg'));setTimeout(function(){$('mpwIn').focus()},50);
}
$('mpwIn').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('mpwYes').click()}});
$('mpwYes').addEventListener('click',function(){
  var m=mpwFor,pw=$('mpwIn').value;if(!m)return;if(!pw){$('mpwIn').focus();return}
  $('mpwYes').disabled=true;
  api({action:'open',id:m.id,mpw:pw,vt:vtok||undefined}).then(function(res){
    if(authFail(res)){hideDlg($('mpwDlg'));return}
    if(!res||!res.ok){$('mpwErr').textContent=(res&&res.message)||'เข้าภารกิจไม่สำเร็จ';$('mpwErr').hidden=false;$('mpwYes').disabled=false;$('mpwIn').value='';$('mpwIn').focus();return}
    mtok[m.id]=res.mt;saveAuth();hideDlg($('mpwDlg'));mpwFor=null;
    if(m.changed){toast('ใส่รหัสภารกิจใหม่แล้ว ใช้งานต่อได้');load();return}
    location.hash='m='+encodeURIComponent(m.id);
  },function(){$('mpwErr').textContent='ติดต่อระบบไม่ได้ ลองอีกครั้ง';$('mpwErr').hidden=false;$('mpwYes').disabled=false});
});

/* ----- Username / Password / ID card / birth date ----- */
var beNow=bkk().y+543,birthYears=[];for(var by=beNow-17;by>=beNow-90;by--)birthYears.push([by,String(by)]);
var crBirth=dateSel($('crBirth'),{ph:['วัน','เดือน','ปี พ.ศ.'],months:MON_TH,years:birthYears});
var crCfg=null;
function credDialog(cfg){
  crCfg=cfg;$('crTitle').textContent=cfg.title;$('crSub').textContent=cfg.sub||'';
  $('crMpwBox').hidden=!cfg.needMpw;$('crNewBox').hidden=!cfg.needNew;
  ['crMpw','crUser','crPw','crId','crNew','crNew2'].forEach(function(k){$(k).value=''});crBirth.set('','','');
  $('crErr').hidden=true;$('crYes').textContent=cfg.yes;$('crYes').disabled=false;showDlg($('credDlg'));
  setTimeout(function(){(cfg.needMpw?$('crMpw'):$('crUser')).focus()},50);
}
$('crNo').addEventListener('click',function(){hideDlg($('credDlg'));crCfg=null});
$('crYes').addEventListener('click',function(){
  var c=crCfg;if(!c)return;var err=function(t){$('crErr').textContent=t;$('crErr').hidden=false};
  var b=crBirth.parts(),iso='';
  if(crBirth.complete()){var y=+b.y-543;iso=y+'-'+p2(+b.m+1)+'-'+p2(+b.d)}
  var data={cred:{u:$('crUser').value.trim(),p:$('crPw').value,idGov:$('crId').value.replace(/\D/g,''),birth:iso},mpw:$('crMpw').value,newPw:$('crNew').value};
  if(c.needMpw&&!data.mpw)return err('กรอกรหัสภารกิจ');
  if(!data.cred.u||!data.cred.p||!data.cred.idGov||!iso)return err('กรอกให้ครบทุกช่อง รวมทั้งวัน เดือน และปีเกิด');
  if(c.needNew){if(data.newPw.length<4)return err('รหัสภารกิจใหม่ต้องมีอย่างน้อย 4 ตัว');if(data.newPw!==$('crNew2').value)return err('ยืนยันรหัสภารกิจใหม่ไม่ตรงกัน')}
  $('crYes').disabled=true;$('crErr').hidden=true;
  c.submit(data).then(function(res){
    if(authFail(res)){hideDlg($('credDlg'));return}
    if(res&&res.error==='takeover_wait'&&c.wait){
      waitTakeover(res,c.wait,function(r){hideDlg($('credDlg'));crCfg=null;c.done(r)},function(msg){err(msg);$('crYes').disabled=false;$('crPw').value=''});return}
    if(!res||!res.ok){err((res&&res.message)||'ไม่สำเร็จ');$('crYes').disabled=false;$('crPw').value='';return}
    hideDlg($('credDlg'));crCfg=null;c.done(res);
  },function(){err('ติดต่อระบบไม่ได้ ลองอีกครั้ง');$('crYes').disabled=false});
});
function missionTxt(m){return [m.flight,m.sectorNo?'Sector '+m.sectorNo:'',m.route,m.date].filter(Boolean).join(' · ')}
function credFlow(kind,m){
  if(kind==='pw')credDialog({title:m.hasPw?'เปลี่ยนรหัสภารกิจ':'ตั้งรหัสภารกิจ',sub:missionTxt(m)+' · ยืนยันตัวตนด้วยข้อมูลใน LOGIN DATABASE',needNew:true,yes:'บันทึกรหัสใหม่',
    submit:function(d){return api({action:'mpw.change',id:m.id,cred:d.cred,newPw:d.newPw})},
    done:function(){delete mtok[m.id];toast('บันทึกรหัสภารกิจใหม่แล้ว');loadMissions()}});
  if(kind==='close')credDialog({title:'ปิดภารกิจ',sub:missionTxt(m)+' · ภารกิจที่ปิดแล้วดูได้อย่างเดียว เปิดอีกครั้งได้ภายหลัง',needMpw:true,yes:'ปิดภารกิจ',
    submit:function(d){return api({action:'mission.close',id:m.id,mpw:d.mpw,cred:d.cred})},
    done:function(){toast('ปิดภารกิจแล้ว');loadMissions()}});
  if(kind==='reopen')credDialog({title:'เปิดภารกิจอีกครั้ง',sub:missionTxt(m),needMpw:true,yes:'เปิดภารกิจ',
    submit:function(d){return api({action:'mission.reopen',id:m.id,mpw:d.mpw,cred:d.cred})},
    done:function(){toast('เปิดภารกิจอีกครั้งแล้ว');loadMissions()}});
}

/* ----- new mission ----- */
var nDate=dateSel($('nDate'),{ph:['1','OCT','26'],years:flightYears()});
var nBirth=dateSel($('nBirth'),{ph:['วัน','เดือน','ปี พ.ศ.'],months:MON_TH,years:birthYears});
var newRid='';   /* รหัสคำขอของฟอร์มนี้: กดซ้ำหรือเน็ตหลุดแล้วกดใหม่ ระบบหลังบ้านจะไม่สร้างภารกิจซ้ำ */
$('bNew').addEventListener('click',function(){
  newRid=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  ['nSector','nName','nFlight','nRoute','nPw','nPw2','nBy','nUser','nPass','nIdGov'].forEach(function(k){$(k).value=''});nDate.set('','','');nBirth.set('','','');
  $('nErr').hidden=true;$('nYes').disabled=false;showDlg($('newDlg'));setTimeout(function(){$('nSector').focus()},50)});
$('nNo').addEventListener('click',function(){hideDlg($('newDlg'))});
$('nYes').addEventListener('click',function(){
  var err=function(t){$('nErr').textContent=t;$('nErr').hidden=false};
  var info={sectorNo:$('nSector').value.trim(),name:$('nName').value.trim(),flight:$('nFlight').value.trim().toUpperCase(),route:normRoute($('nRoute').value),date:flightText(nDate)};
  if(!info.flight)return err('กรอกเที่ยวบินที่');
  if(!info.sectorNo)return err('กรอกหมายเลข Sector');
  if(!nDate.blank()&&!nDate.complete())return err('เลือกวัน เดือน และปีให้ครบ');
  if($('nPw').value.length<4)return err('รหัสภารกิจต้องมีอย่างน้อย 4 ตัว');
  if($('nPw').value!==$('nPw2').value)return err('ยืนยันรหัสภารกิจไม่ตรงกัน');
  if(!$('nBy').value.trim())return err('กรอกชื่อผู้บันทึก');
  var b=nBirth.parts(),cred={u:$('nUser').value.trim(),p:$('nPass').value,idGov:$('nIdGov').value.replace(/\D/g,''),birth:nBirth.complete()?(+b.y-543)+'-'+p2(+b.m+1)+'-'+p2(+b.d):''};
  if(!cred.u||!cred.p||!cred.idGov||!cred.birth)return err('กรอก Username, Password, หมายเลขบัตรข้าราชการ และวันเดือนปีเกิดให้ครบ');
  $('nYes').disabled=true;$('nErr').hidden=true;
  api({action:'create',rid:newRid,by:$('nBy').value.trim(),info:info,mpw:$('nPw').value,cred:cred}).then(function(res){
    if(authFail(res)){hideDlg($('newDlg'));return}
    if(!res||!res.ok){err((res&&res.message)||'เปิดภารกิจไม่สำเร็จ');$('nYes').disabled=false;$('nPass').value='';return}
    mtok[res.id]=res.mt;saveAuth();hideDlg($('newDlg'));toast('เปิดภารกิจใหม่แล้ว');location.hash='m='+res.id;
  },function(){err('ติดต่อระบบไม่ได้ ลองอีกครั้ง');$('nYes').disabled=false});
});
function normRoute(v){return String(v||'').toUpperCase().trim().replace(/\s*[-–—\/>]+\s*/g,'-').replace(/\s+/g,'-')}

/* =====================================================================
   Seat plan page
   ===================================================================== */
function showPlan(id){
  if(curId!==id){curId=id;M=null;datePartial=false;D=loadDraft(id);$('zones').textContent='';$('sync').hidden=true;$('whoP').value='';$('saveBar').hidden=true;setView('pax',true);
    if(atok&&admMission!==id)dropAdmin()}
  $('pageMissions').hidden=true;$('pagePlan').hidden=false;
  return load();
}
function leavePlan(){
  if(atok&&curId&&sess){api({action:'admin.logout',id:curId,at:atok,vt:vtok||undefined,why:'ออกจากหน้าภารกิจ'}).catch(function(){})}
  dropAdmin();if(curId)delete mtok[curId];curId=null;M=null;D=null;view='pax';$('saveBar').hidden=true;saveAuth();
}
var loading=false,saving=false;
function load(){
  if(loading||!curId)return Promise.resolve();loading=true;var id=curId;
  return api({action:'load',id:id,mt:mtok[id],at:atok||undefined}).then(function(res){
    if(id!==curId)return;
    if(authFail(res))return;
    if(res&&res.error==='no_mission'){toast('ไม่พบภารกิจนี้ (แท็บอาจถูกลบ)',true);location.hash='';return}
    if(!res||!res.ok)throw new Error(res&&res.message||'load');
    var prev=M&&M.lastSave;
    M={id:res.id,tab:res.tab,mstatus:res.mstatus,closeInfo:res.closeInfo,info:res.info||{},crew:res.crew||{},pax:{},crewPax:res.crewPax?{}:null,meta:{},
       status:res.status||{},statusError:res.statusError||'',history:res.history||[],lastSave:res.lastSave};
    Object.keys(res.pax||{}).forEach(function(k){if(SEAT[k]){M.pax[k]=norm(res.pax[k]);M.meta[k]={by:res.pax[k].by||'',at:res.pax[k].at||''}}});
    if(res.crewPax)Object.keys(res.crewPax).forEach(function(k){if(SEAT[k]){M.crewPax[k]=norm(res.crewPax[k]);M.meta[k]={by:res.crewPax[k].by||'',at:res.crewPax[k].at||''}}});
    if(atok&&!res.admin){var why=res.adminWhy,was=view==='admin';dropAdmin();if(was)setView('pax');if(why&&(was||!restoreView))ask('ออกจากหน้า ADMIN',why,'',null)}
    if(restoreView){restoreView=false;if(atok&&res.admin)setView('admin',true)}
    $('saveBar').hidden=true;
    if(prev&&M.lastSave&&prev.at!==M.lastSave.at&&!justSaved&&pending().n)toast('มีการ SAVE จาก '+(M.lastSave.by||'เครื่องอื่น')+' เมื่อ '+fmtTH(M.lastSave.at)+' ผังแสดงข้อมูลล่าสุดแล้ว');
    justSaved=false;
    cleanDraft();persistDraft();renderAll();
    $('sync').hidden=true;
  }).catch(function(){$('sync').textContent='ดึงข้อมูลจาก Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วกด Ctrl+F5';$('sync').hidden=false})
  .then(function(){loading=false});
}
var justSaved=false;

function setView(v,quiet){
  view=v;var adm=v==='admin';
  $('paxTools').hidden=adm;$('admTools').hidden=!adm;$('whoBox').hidden=adm;$('infoCard').hidden=adm;$('crewCard').hidden=!adm;
  $('bAdmin').textContent=adm?'กลับหน้าผู้โดยสาร':'ADMIN';
  $('admTag').textContent='ADMIN · '+admUser;
  saveAuth();
  if(!quiet)renderAll();
}
function dropAdmin(){atok='';admUser='';admMission='';if(M)M.crewPax=null;saveAuth()}
function renderAll(){if(!M)return;renderTitle();renderInfo();renderPlan();renderManifest();renderHistory();renderAdmin();renderTools();renderNotice()}
function renderNotice(){var n=$('notice'),msgs=[];
  if(closed())msgs.push('ภารกิจนี้ปิดแล้ว ('+(M.closeInfo||'')+') ดูได้อย่างเดียว ถ้าต้องการแก้ไขให้เปิดภารกิจอีกครั้งจากหน้ารายการภารกิจ');
  if(M.statusError)msgs.push('อ่านสภาพที่นั่งจากไฟล์ Seat Plan 340 (For Admin) ไม่ได้ ('+M.statusError+') ผังจึงแสดงทุกที่นั่งเป็นปกติ');
  n.hidden=!msgs.length;n.textContent=msgs.join(' · ')}
function renderTitle(){
  var fl=getInfo('flight'),dt=getInfo('date'),nm=getInfo('name'),sc=getInfo('sectorNo'),rt=getInfo('route');
  var h=$('planTitle');h.textContent=(fl||'ภารกิจใหม่')+(sc?' · Sector '+sc:'')+(dt?' · '+dt:'');
  h.appendChild(el('small',null,[view==='admin'?'SEAT PLAN A340 · ADMIN (ลูกเรือ)':'SEAT PLAN A340',rt,nm].filter(Boolean).join(' · ')));
  document.title=(fl||'Mission')+' · A340 Seat Plan';
}

/* ----- mission info form ----- */
var infoInputs=[].slice.call(document.querySelectorAll('#infoForm input[data-k]'));
var iDate=dateSel($('iDate'),{ph:['1','OCT','26'],years:flightYears(),onChange:function(){
  if(iDate.complete()){datePartial=false;setInfo('date',flightText(iDate))}
  else if(iDate.blank()){datePartial=false;setInfo('date','')}
  else{datePartial=true;renderDate()}}});
var datePartial=false;
function renderDate(){
  if(!datePartial)setFlight(iDate,getInfo('date'));
  if(D&&'date' in D.info)$('iDate').dataset.pending='1';else delete $('iDate').dataset.pending;
  iDate.selects.forEach(function(s){s.disabled=closed()});
}
function renderInfo(){
  infoInputs.forEach(function(inp){var k=inp.dataset.k;
    if(document.activeElement!==inp)inp.value=getInfo(k);inp.readOnly=closed();
    if(D&&k in D.info)inp.dataset.pending='1';else delete inp.dataset.pending});
  renderDate();
}
function setInfo(k,v){
  if(closed())return;
  if(UPPER[k])v=v.toUpperCase();
  if(!(k in D.info))D.infoBase[k]=savedInfo(k);
  D.info[k]=v;cleanDraft();persistDraft();renderInfo();renderTitle();renderTools();
}
infoInputs.forEach(function(inp){
  inp.addEventListener('input',function(){setInfo(inp.dataset.k,inp.value)});
  inp.addEventListener('blur',function(){var k=inp.dataset.k,v=inp.value.trim();
    if(k==='time'){var m=/^(\d{1,2})[:.\s]?(\d{2})$/.exec(v);if(m&&+m[1]<24&&+m[2]<60)v=p2(+m[1])+':'+m[2]}
    if(k==='route')v=normRoute(v);
    if(k==='sectorNo')v=v.replace(/[^0-9A-Za-z]/g,'');
    if(v!==inp.value)inp.value=v;if(!closed())setInfo(k,v)});
});

/* ----- cabin ----- */
function seatBtn(id,text,mon,ctx){
  var b=el('button','seat');b.type='button';b.dataset.id=id;
  if(mon)b.appendChild(el('span','m'));
  var s=el('span','s');s.appendChild(el('span','lt',text));b.appendChild(s);
  var st=status(id),crew=isCrew(id,ctx.crew),p=crew?(ctx.mode==='crew'?getCrewPax(id):null):getPax(id);
  b.dataset.s=st.s;if(mon)b.dataset.m=st.m;
  if(p){b.classList.add('occ');s.appendChild(el('span','nm',shortName(p)))}
  if(crew)b.classList.add('crew');
  if(crew&&ctx.mode==='crew')b.classList.add('crewedit');
  if(!ctx.report&&((ctx.mode==='crew'&&crewPending(id))||(ctx.mode!=='crew'&&paxPending(id))))b.dataset.pending='1';
  var who=p?shortName(p)+' · '+(thFull(p)||enFull(p)):'ว่าง';
  var label=(id==='CC'?'Mission Commander':'ที่นั่ง '+id)+(crew?' · CREW ZONE':'')+(st.s===2?' · ที่นั่งใช้ไม่ได้':st.s===1?' · ที่นั่งขัดข้องแต่ใช้ได้':'')+(st.note?' ('+st.note+')':'')+
    (mon?(st.m===2?' · จอเสีย':st.m===1?' · จอเสื่อม':''):'')+' · '+who;
  b.title=label;b.setAttribute('aria-label',label);
  if(ctx.report)b.tabIndex=-1;
  return b;
}
function buildZones(host,report,mode){
  host.textContent='';var crew=crewRows(getCrew()),stats=zoneStats(),ctx={crew:crew,report:report,mode:mode};
  ZONES.forEach(function(z){
    var sec=el('section','zone zone-'+z.key),h=el('header'),v=stats[z.key];
    h.appendChild(el('h2',null,z.title));
    var cm=mode==='crew',nfree=cm?v.crewFree:v.free,bd=el('span','badge'+(nfree?'':' zero'));
    if(cm&&!v.crew)bd.append('ไม่มี CREW ZONE');
    else{bd.append(cm?'ที่นั่งลูกเรือว่าง ':'ที่นั่งว่าง ');bd.appendChild(el('b',null,String(nfree)));if(!cm&&v.freeBad)bd.append(' · ใช้ไม่ได้ '+v.freeBad)}
    bd.title=cm?'ที่นั่งใน CREW ZONE ที่ยังไม่มีชื่อลูกเรือ '+v.crewFree+' จาก '+v.crew+' ที่นั่ง':
      'ที่นั่งว่างสำหรับผู้โดยสาร '+v.free+' ที่นั่ง (หัก CREW ZONE และที่นั่งที่มีชื่อแล้ว) รวมที่นั่งใช้ไม่ได้ '+v.freeBad+' ที่นั่ง ซึ่งใส่ชื่อได้เมื่อที่นั่งไม่พอ';
    h.appendChild(bd);sec.appendChild(h);
    var box=el('div','rows'),cbox=null;
    function put(row,key){
      if(crew[key]){if(!cbox){cbox=el('div','crewbox');cbox.appendChild(el('div','crewlbl','CREW ZONE'));box.appendChild(cbox)}cbox.appendChild(row)}
      else{cbox=null;box.appendChild(row)}
    }
    z.items.forEach(function(it){
      if(it.cc){
        var room=el('div','ccroom');room.appendChild(seatBtn('CC','CC',true,ctx));room.appendChild(el('span','cclabel','Mission Commander'));
        var r=el('div','row ccrow');r.appendChild(room);put(r,'CC');return;
      }
      if(it.ovh){
        var o=el('div','row ovhrow');o.appendChild(el('div','rowno'));
        ['L','C','R'].forEach(function(p,i){
          var id='MON-'+it.ovh+'-'+p,st=status(id);if(i)o.appendChild(el('div','aisle'));
          var g=el('div','grp');it.g[i].split('').forEach(function(){g.appendChild(el('div','gap'))});
          var b=el('span','ovh','Monitor');b.dataset.m=st.m;b.title='Monitor หน้าแถว '+it.ovh+' ('+['ซ้าย','กลาง','ขวา'][i]+') · '+['จอปกติ','จอเสื่อม','จอเสีย'][st.m]+(st.note?' · '+st.note:'');
          g.appendChild(b);o.appendChild(g)});
        put(o,it.ovh);return;
      }
      var r2=el('div','row');r2.appendChild(el('div','rowno',String(it.n)));
      it.g.forEach(function(grp,gi){
        if(gi)r2.appendChild(el('div','aisle'));if(grp==='')return;
        var g=el('div','grp'),real=grp.replace(/_/g,'').length,n=grp.length;
        if(real&&real<n)g.style.minWidth='calc('+n+' * var(--sw) + '+(n-1)+' * var(--sg))';
        grp.split('').forEach(function(L){if(L==='_'){if(!real)g.appendChild(el('div','gap'));return}
          g.appendChild(seatBtn(it.n+L,L,it.mon,ctx))});
        r2.appendChild(g)});
      put(r2,String(it.n));
    });
    sec.appendChild(box);host.appendChild(sec);
  });
}
function renderPlan(){buildZones($('zones'),false,view==='admin'?'crew':'pax')}
$('zones').addEventListener('click',function(e){var b=e.target.closest('.seat[data-id]');if(b)openSeat(b.dataset.id)});

/* ----- manifest (passengers, or crew on the ADMIN page) ----- */
function manifestRows(mode){var set=crewRows(getCrew());
  return SEATS.filter(function(id){return mode==='crew'?(set[SEAT[id].row]&&getCrewPax(id)):(!set[SEAT[id].row]&&getPax(id))}).map(function(id){
    var p=mode==='crew'?getCrewPax(id):getPax(id),st=status(id);
    return {id:id,p:p,zone:zoneOf(SEAT[id].zone).name,bad:st.s===2,pend:mode==='crew'?crewPending(id):paxPending(id)}})}
function manifestHead(){return '<thead><tr><th>ที่นั่ง</th><th>โซน</th><th>ยศ ชื่อ-สกุล (ไทย)</th><th>RANK NAME (EN)</th><th></th></tr></thead>'}
function manifestRow(r,report){var tr=el('tr');tr.dataset.id=r.id;
  tr.appendChild(el('td',null,r.id));tr.appendChild(el('td',null,r.zone));
  tr.appendChild(el('td',null,thFull(r.p)));tr.appendChild(el('td','en',enFull(r.p)));
  var t=el('td');
  if(r.bad)t.appendChild(el('span','tag b','ที่นั่งใช้ไม่ได้'));
  if(r.pend&&!report)t.appendChild(el('span','tag p','ยังไม่ SAVE'));
  tr.appendChild(t);return tr}
function renderManifest(){
  var mode=view==='admin'?'crew':'pax',list=manifestRows(mode),t=$('manifest');t.innerHTML=manifestHead();var tb=el('tbody');
  list.forEach(function(r){tb.appendChild(manifestRow(r,false))});t.appendChild(tb);
  $('manTitle').firstChild.nodeValue=mode==='crew'?'รายชื่อลูกเรือ ':'รายชื่อผู้โดยสาร ';
  $('pempty').hidden=list.length>0;t.hidden=!list.length;$('pcount').textContent=list.length?'('+list.length+' คน)':'';
}
$('manifest').addEventListener('click',function(e){var tr=e.target.closest('tr[data-id]');if(tr)openSeat(tr.dataset.id)});

function renderHistory(){
  var t=$('history'),h=M.history||[];t.innerHTML='<thead><tr><th>เวลา</th><th>ผู้บันทึก</th><th>ประเภท</th><th>ที่นั่ง / ช่อง</th><th>ค่าเดิม</th><th>ค่าใหม่</th></tr></thead>';
  var tb=el('tbody');h.forEach(function(r){var tr=el('tr');for(var i=0;i<6;i++)tr.appendChild(el('td',null,r[i]||''));tb.appendChild(tr)});
  if(!h.length){var tr=el('tr'),td=el('td',null,'ยังไม่มีประวัติ');td.colSpan=6;tr.appendChild(td);tb.appendChild(tr)}
  t.appendChild(tb);$('hcount').textContent=h.length?'('+h.length+' รายการล่าสุด)':'';
}

/* ----- tools / status ----- */
function renderTools(){
  var n=pending().n,ro=closed();
  $('pend').textContent=ro?'ภารกิจปิดแล้ว ดูได้อย่างเดียว':n?('แก้ไขแล้ว '+n+' รายการ ยังไม่ได้ SAVE'):'ไม่มีการแก้ไขค้าง';$('pend').classList.toggle('on',n>0||ro);
  var sb=view==='admin'?$('aSave'):$('bSave');
  if(!saving){sb.textContent=n?'SAVE ('+n+')':'SAVE';sb.disabled=!n||ro}
  $('bClear').disabled=ro;$('aClear').disabled=ro;
  var ls=M&&M.lastSave,lb=$('lastSave');lb.textContent='';
  if(ls&&ls.at){var who=[ls.e,ls.u,ls.by&&ls.by!==ls.u?ls.by:''].filter(Boolean);
    lb.appendChild(document.createTextNode('SAVE ล่าสุด: '+(who.length?who.join(' · ')+' · ':'')));lb.appendChild(el('b','lsat',fmtTH(ls.at)))}
  else lb.textContent='ยังไม่เคย SAVE';
  var st=zoneStats().sum,sm=$('seatSum'),n;
  if(view==='admin'){n=st.crewFree;sm.textContent=st.crew?'ที่นั่งลูกเรือคงเหลือ '+n+' จาก '+st.crew+' ที่นั่ง':'ยังไม่ได้กั้น CREW ZONE';sm.title='ที่นั่งใน CREW ZONE ที่ยังไม่มีชื่อลูกเรือ'}
  else{n=st.free;sm.textContent='ที่นั่งคงเหลือ '+n+' จาก '+(st.t-st.crew)+' ที่นั่ง'+(st.freeBad?' (รวมที่นั่งใช้ไม่ได้ '+st.freeBad+')':'');
    sm.title='หัก CREW ZONE ('+st.crew+' ที่นั่ง) และที่นั่งที่มีชื่อผู้โดยสารแล้ว ('+st.occ+' ที่นั่ง) · ที่นั่งใช้ไม่ได้ใส่ชื่อได้เมื่อที่นั่งไม่พอ'}
  sm.classList.toggle('zero',!n);
}

/* ----- seat dialog (passenger, or crew on the ADMIN page) ----- */
(function(){var dl=$('rankList');RANKS.forEach(function(r){var o=document.createElement('option');o.value=r[0];o.label=r[1];dl.appendChild(o)})})();
var cur=null,curMode='pax',autoRe='',dupOk=false;
var FIELDS={rt:'pRt',ft:'pFt',lt:'pLt',re:'pRe',fe:'pFe',le:'pLe'};
function openSeat(id){
  if(!SEAT[id]||!M)return;
  var crew=isCrew(id),mode=view==='admin'?'crew':'pax';
  cur=id;curMode=mode;dupOk=false;
  var p=(mode==='crew'?getCrewPax(id):getPax(id))||EMPTY,st=status(id),z=zoneOf(SEAT[id].zone);
  $('dTitle').textContent=(id==='CC'?'Mission Commander':'ที่นั่ง '+id)+' · '+z.title+(mode==='crew'?' · ลูกเรือ':'');
  var sv=(mode==='crew'?(M.crewPax&&M.crewPax[id]):M.pax[id])&&M.meta[id],pend=mode==='crew'?crewPending(id):paxPending(id);
  $('dSub').textContent=(pend?'มีการแก้ไขที่ยังไม่ SAVE · ':'')+(sv&&sv.at?'บันทึกล่าสุด '+[sv.by,sv.at].filter(Boolean).join(' · '):'ยังไม่มีการบันทึกที่นั่งนี้');
  var canEdit,msg=[],bad=false;
  if(mode==='crew'){canEdit=crew&&!closed();if(!crew){msg.push('ที่นั่งนี้ไม่อยู่ใน CREW ZONE ข้อมูลลูกเรือกรอกได้เฉพาะที่นั่งใน CREW ZONE');bad=true}}
  else{canEdit=!crew&&!closed();if(crew){msg.push('ที่นั่งนี้อยู่ใน CREW ZONE กันไว้ให้ลูกเรือ ผู้โดยสารกรอกไม่ได้');bad=true}}
  if(st.s===2){msg.push('ที่นั่งนี้ใช้งานไม่ได้'+(st.note?' : '+st.note:'')+(canEdit?' · ใส่ชื่อได้ในกรณีที่นั่งไม่พอ':''));bad=true}
  else if(st.s===1)msg.push('ที่นั่งนี้มีข้อขัดข้องแต่ยังใช้ได้'+(st.note?' : '+st.note:''));
  if(SEAT[id].mon&&st.m)msg.push('จอ Monitor '+(st.m===2?'เสีย':'เสื่อมสภาพ')+(status(id).note&&!st.s?' : '+st.note:''));
  if(closed())msg.push('ภารกิจปิดแล้ว ดูได้อย่างเดียว');
  var note=$('dState');note.hidden=!msg.length;note.className='dnote'+(bad?' bad':'');note.textContent=msg.join(' · ');
  PF.forEach(function(k){$(FIELDS[k]).value=p[k];$(FIELDS[k]).disabled=!canEdit});
  autoRe=rankEn(p.rt)===p.re?p.re:'';
  $('dOk').hidden=!canEdit;$('dCancel').textContent=canEdit?'ยกเลิก':'ปิด';
  $('dClearSeat').hidden=!canEdit||isEmpty(p);$('dErr').hidden=true;
  showDlg($('dlg'));if(canEdit)setTimeout(function(){$('pRt').focus()},50);
}
$('pRt').addEventListener('input',function(){var en=rankEn($('pRt').value),re=$('pRe').value.trim();
  if(en&&(!re||re===autoRe)){$('pRe').value=en;autoRe=en}});
['pRe','pFe','pLe'].forEach(function(k){$(k).addEventListener('blur',function(){$(k).value=$(k).value.toUpperCase()})});
$('dCancel').addEventListener('click',function(){hideDlg($('dlg'));cur=null});
function setPerson(mode,id,val){
  var bag=mode==='crew'?D.crewPax:D.pax,saved=mode==='crew'?(M.crewPax&&M.crewPax[id]):M.pax[id];
  if(!bag[id])bag[id]={base:norm(saved),val:null};
  bag[id].val=norm(val);cleanDraft();persistDraft();
}
function afterEdit(){renderPlan();renderManifest();renderTools()}
$('dOk').addEventListener('click',function(){
  if(!cur)return;var id=cur,mode=curMode;
  var v={};PF.forEach(function(k){var x=$(FIELDS[k]).value.trim().replace(/\s{2,}/g,' ');if(k==='rt'||k==='re')x=x.replace(/\s+/g,'');if(k==='re'||k==='fe'||k==='le')x=x.toUpperCase();v[k]=x});
  if(!isEmpty(v)&&!v.ft&&!v.fe){$('dErr').textContent='กรุณากรอกชื่อ ภาษาไทย หรือ ภาษาอังกฤษ อย่างน้อย 1 ช่อง';$('dErr').hidden=false;return}
  if(!dupOk&&!isEmpty(v)){
    var key=function(a,b){return (String(a||'')+' '+String(b||'')).replace(/\s+/g,' ').trim().toUpperCase()};
    var mine=[key(v.ft,v.lt),key(v.fe,v.le)];
    var dup=SEATS.filter(function(o){if(o===id)return false;var q=getPax(o)||getCrewPax(o);if(!q)return false;
      return (v.ft&&key(q.ft,q.lt)===mine[0])||(v.fe&&key(q.fe,q.le)===mine[1])});
    if(dup.length){$('dErr').textContent='ชื่อนี้มีอยู่แล้วที่ที่นั่ง '+dup.join(', ')+' ถ้าต้องการบันทึกซ้ำ กดตกลงอีกครั้ง';$('dErr').hidden=false;dupOk=true;return}
  }
  setPerson(mode,id,v);hideDlg($('dlg'));cur=null;afterEdit();
});
$('dClearSeat').addEventListener('click',function(){if(!cur)return;setPerson(curMode,cur,EMPTY);hideDlg($('dlg'));toast('ล้างที่นั่ง '+cur+' แล้ว กด SAVE เพื่อบันทึก');cur=null;afterEdit()});
PF.forEach(function(k){$(FIELDS[k]).addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('dOk').click()}})});

/* ----- CLEAR (passenger names only / crew names only) ----- */
$('bClear').addEventListener('click',function(){
  if(closed())return;var occ=SEATS.filter(function(id){return getPax(id)});
  if(!occ.length){toast('ยังไม่มีรายชื่อผู้โดยสารให้ล้าง');return}
  ask('CLEAR ล้างรายชื่อผู้โดยสาร','ล้างรายชื่อผู้โดยสารทุกที่นั่ง ('+occ.length+' คน) ข้อมูลภารกิจไม่ถูกลบ การล้างจะบันทึกลง Google Sheet เมื่อกด SAVE ประวัติเดิมยังอยู่','ล้างรายชื่อทั้งหมด',function(){
    occ.forEach(function(id){setPerson('pax',id,EMPTY)});renderAll();toast('ล้างรายชื่อแล้ว กด SAVE เพื่อบันทึก');
  });
});
$('aClear').addEventListener('click',function(){
  if(closed())return;var occ=SEATS.filter(function(id){return getCrewPax(id)});
  if(!occ.length){toast('ยังไม่มีรายชื่อลูกเรือให้ล้าง');return}
  ask('CLEAR ล้างรายชื่อลูกเรือ','ล้างรายชื่อลูกเรือทุกที่นั่ง ('+occ.length+' คน) การกั้นที่นั่งไม่เปลี่ยน การล้างจะบันทึกเมื่อกด SAVE','ล้างรายชื่อลูกเรือ',function(){
    occ.forEach(function(id){setPerson('crew',id,EMPTY)});renderAll();toast('ล้างรายชื่อลูกเรือแล้ว กด SAVE เพื่อบันทึก');
  });
});

/* ----- SAVE ----- */
/* ---- 16. saving at the same time ----
   Every draft remembers the value it was made from (base). If the sheet now holds something else for that seat / field,
   someone else saved it first: the user picks, item by item, whose value stays (16.4). Nothing is overwritten unseen. */
function seatLabel(id){return id==='CC'?'Mission Commander (CC)':'ที่นั่ง '+id}
function pText(p){p=p&&!isEmpty(p)?norm(p):null;return p?[thFull(p),enFull(p)].filter(Boolean).join(' / '):'(ว่าง)'}
function lsWho(){var ls=M&&M.lastSave;return ls&&ls.at?[ls.by,fmtTH(ls.at)].filter(Boolean).join(' · '):''}
function metaWho(id){var m=M&&M.meta&&M.meta[id];return m&&(m.by||m.at)?[m.by,fmtSheet(m.at)].filter(Boolean).join(' · '):lsWho()}
function crewTxt(c){var f=crewFront(c.front),t=!f?'หัว: ไม่กั้น':!f.end?'หัว: ห้อง Mission Commander':'หัว: '+(f.cc?'Mission Commander ':'แถว 1 ')+'ถึงแถว '+ROWS[f.end];
  return t+' · ท้าย: '+(c.rear?'ถึงแถว '+c.rear:'ไม่กั้น')}
function findConflicts(mode){
  var out=[];if(!D||!M)return out;
  if(mode==='admin'){
    if(D.crew&&D.crewBase){var sc=savedCrew();if(D.crewBase.front!==sc.front||D.crewBase.rear!==sc.rear)out.push({kind:'crew',id:'crew',label:'CREW ZONE',mine:crewTxt(D.crew),theirs:crewTxt(sc),who:lsWho()})}
    Object.keys(D.crewPax).forEach(function(id){var sv=M.crewPax&&M.crewPax[id];if(!same(D.crewPax[id].base,sv))out.push({kind:'crewPax',id:id,label:seatLabel(id),mine:pText(D.crewPax[id].val),theirs:pText(sv),who:metaWho(id)})});
  }else{
    INFO_KEYS.forEach(function(k){if(!(k in D.info))return;var base=D.infoBase[k]==null?savedInfo(k):D.infoBase[k];
      if(base!==savedInfo(k))out.push({kind:'info',id:k,label:'ข้อมูลภารกิจ: '+INFO_LABEL[k],mine:D.info[k]||'(ว่าง)',theirs:savedInfo(k)||'(ว่าง)',who:lsWho()})});
    SEATS.forEach(function(id){if(!D.pax[id])return;var sv=M.pax[id];if(!same(D.pax[id].base,sv))out.push({kind:'pax',id:id,label:seatLabel(id),mine:pText(D.pax[id].val),theirs:pText(sv),who:metaWho(id)})});
  }
  return out;
}
var cfList=[],cfMode='pax',cfPick={};
function openConflicts(list,mode){
  cfList=list;cfMode=mode;cfPick={};
  var t=$('cfTable');t.innerHTML='<thead><tr><th>รายการ</th><th>ของคุณ</th><th>ในระบบ (ผู้บันทึก · เวลา)</th><th>เลือก</th></tr></thead>';
  var tb=el('tbody');
  list.forEach(function(c,i){var tr=el('tr','need');tr.dataset.i=i;
    tr.appendChild(el('td',null,c.label));tr.appendChild(el('td',null,c.mine));
    var w=el('td','cfwho');w.appendChild(document.createTextNode(c.theirs));if(c.who)w.appendChild(el('small',null,c.who));tr.appendChild(w);
    var ch=el('td');[['mine','ใช้ของคุณ'],['theirs','ใช้ในระบบ']].forEach(function(o){var l=el('label'),r=el('input');r.type='radio';r.name='cf'+i;r.value=o[0];
      r.addEventListener('change',function(){cfPick[i]=o[0];tr.classList.remove('need');$('cfYes').disabled=Object.keys(cfPick).length<cfList.length});
      l.appendChild(r);l.appendChild(document.createTextNode(o[1]));ch.appendChild(l)});
    tr.appendChild(ch);tb.appendChild(tr)});
  t.appendChild(tb);$('cfYes').disabled=true;showDlg($('cfDlg'));
}
$('cfNo').addEventListener('click',function(){hideDlg($('cfDlg'));toast('ยังไม่ได้บันทึก สิ่งที่กรอกไว้ยังอยู่ กด SAVE ใหม่เมื่อพร้อม')});
$('cfYes').addEventListener('click',function(){
  if(Object.keys(cfPick).length<cfList.length||!D||!M)return;
  cfList.forEach(function(c,i){var mine=cfPick[i]==='mine';
    if(c.kind==='pax'){if(mine)D.pax[c.id].base=norm(M.pax[c.id]);else delete D.pax[c.id]}
    else if(c.kind==='crewPax'){if(mine)D.crewPax[c.id].base=norm(M.crewPax&&M.crewPax[c.id]);else delete D.crewPax[c.id]}
    else if(c.kind==='info'){if(mine)D.infoBase[c.id]=savedInfo(c.id);else{delete D.info[c.id];delete D.infoBase[c.id]}}
    else if(c.kind==='crew'){if(mine)D.crewBase=savedCrew();else{D.crew=null;D.crewBase=null}}});
  hideDlg($('cfDlg'));cleanDraft();persistDraft();renderAll();
  var mode=cfMode;if(!pending(mode==='admin'?'admin':'pax').n){toast('ใช้ข้อมูลในระบบทั้งหมด ไม่มีรายการต้อง SAVE');return}
  (mode==='admin'?doAdminSave():doSave());
});
/* 16.2 someone else saved while this device still has drafts: yellow bar (no drafts: the plan just reloads) */
var lastSelfSave='';
function seenSave(ls){
  if(!ls||!ls.at||!M||saving||loading)return;
  var cur=M.lastSave&&M.lastSave.at||'';if(ls.at===cur||ls.at===lastSelfSave)return;
  var t=(ls.by||'เครื่องอื่น')+' เมื่อ '+hm(new Date(ls.at).getTime())+' น.';
  if(!pending('pax').n&&!pending('admin').n){load().then(function(){toast('มีการบันทึกจาก '+t+' ผังแสดงข้อมูลล่าสุดแล้ว')});return}
  $('sbMsg').textContent='🔔 มีการบันทึกจาก '+t;$('saveBar').hidden=false;
}
$('sbLoad').addEventListener('click',function(){$('saveBar').hidden=true;load().then(function(){
  var mode=view==='admin'?'admin':'pax',c=findConflicts(mode);
  if(c.length)openConflicts(c,mode);else toast('โหลดข้อมูลล่าสุดแล้ว ไม่มีรายการที่ชนกัน กรอกต่อได้')})});
/* res: true = saved · false = not saved · 'retry' = someone saved first, load the latest and try again */
var reCheck=null;
function afterSaveRes(res,sent,pd,mode){
  if(authFail(res))return false;
  if(res&&res.error==='stale'){toast('มีผู้ SAVE ไปก่อน กำลังโหลดข้อมูลล่าสุดแล้วบันทึกต่อ…');return 'retry'}
  if(!res||!res.ok){toast('SAVE ไม่สำเร็จ'+(res&&res.message?' ('+res.message+')':'')+' ลองกด SAVE อีกครั้ง',true);return false}
  if(res.lastSave&&res.lastSave.at)lastSelfSave=res.lastSave.at;
  if(mode==='admin'){
    if(pd.crew&&D.crew&&sent.crew&&D.crew.front===sent.crew.front&&D.crew.rear===sent.crew.rear){D.crew=null;D.crewBase=null}
    pd.crewPax.forEach(function(id){if(D.crewPax[id]&&same(D.crewPax[id].val,sent.crewPax[id].val))delete D.crewPax[id]});
  }else{
    pd.info.forEach(function(k){if(D.info[k]===sent.info[k]){delete D.info[k];delete D.infoBase[k]}});
    pd.pax.forEach(function(id){if(D.pax[id]&&same(D.pax[id].val,sent.pax[id].val))delete D.pax[id]});
  }
  // ที่นั่งใน CREW ZONE (ผู้โดยสาร) / นอก CREW ZONE (ลูกเรือ) บันทึกไม่ได้: ตัดออก · รายการที่มีคนแก้ไปก่อน: ให้เลือกหลังโหลดล่าสุด
  var conf=res.conflicts||[],drop=conf.filter(function(c){return mode==='admin'?c.kind==='notcrew':c.kind==='crew'});
  drop.forEach(function(c){if(mode==='admin')delete D.crewPax[c.id];else delete D.pax[c.id]});
  if(conf.length>drop.length)reCheck=mode;
  persistDraft();justSaved=true;
  if(drop.length)ask('บางรายการไม่ได้บันทึก',drop.map(function(c){return c.id}).join(', ')+(mode==='admin'?' ไม่อยู่ใน CREW ZONE':' อยู่ใน CREW ZONE')+' ระบบจึงไม่บันทึก และแสดงข้อมูลล่าสุดแทน','',null);
  else toast('SAVE ลง Google Sheet เรียบร้อย '+(res.saved||0)+' รายการ');
  return true;
}
function afterSave(ok,mode,retry,again){
  saving=false;renderTools();
  if(ok===true)return load().then(function(){
    if(reCheck===mode){reCheck=null;var c=findConflicts(mode);if(c.length)openConflicts(c,mode)}return true});
  if(ok==='retry')return load().then(function(){
    var c=findConflicts(mode);if(c.length){openConflicts(c,mode);return false}
    if(retry>=2){toast('มีการบันทึกจากเครื่องอื่นต่อเนื่อง ลองกด SAVE อีกครั้ง',true);return false}
    return again(retry+1)});
  return ok;
}
function doSave(retry){
  retry=retry||0;
  if(saving||!M||closed())return Promise.resolve(false);
  var pd=pending('pax');if(!pd.n){toast('ไม่มีรายการที่ต้อง SAVE');return Promise.resolve(true)}
  var by=$('whoP').value.trim();
  if(!by){toast('กรุณากรอกชื่อผู้บันทึกก่อน SAVE',true);$('whoP').focus();$('whoP').classList.add('need');return Promise.resolve(false)}
  var cf=findConflicts('pax');if(cf.length){openConflicts(cf,'pax');return Promise.resolve(false)}
  var body={action:'save',id:curId,mt:mtok[curId],by:by,rev:M.lastSave&&M.lastSave.at||'',info:{},pax:[]};
  pd.info.forEach(function(k){body.info[k]={base:D.infoBase[k]||'',val:D.info[k]}});
  pd.pax.forEach(function(id){body.pax.push({id:id,base:D.pax[id].base,val:D.pax[id].val})});
  saving=true;$('bSave').disabled=true;$('bSave').textContent='กำลัง SAVE…';
  var sent=JSON.parse(JSON.stringify(D));
  return api(body).then(function(res){return afterSaveRes(res,sent,pd,'pax')},function(){toast('ติดต่อ Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วกด SAVE อีกครั้ง',true);return false})
  .then(function(ok){return afterSave(ok,'pax',retry,doSave)});
}
$('bSave').addEventListener('click',function(){doSave()});
$('whoP').addEventListener('input',function(){$('whoP').classList.remove('need')});
function doAdminSave(retry){
  retry=retry||0;
  if(saving||!M||closed()||!atok)return Promise.resolve(false);
  var pd=pending('admin');if(!pd.n){toast('ไม่มีรายการที่ต้อง SAVE');return Promise.resolve(true)}
  var cf=findConflicts('admin');if(cf.length){openConflicts(cf,'admin');return Promise.resolve(false)}
  var body={action:'admin.save',id:curId,mt:mtok[curId],at:atok,rev:M.lastSave&&M.lastSave.at||'',crewPax:[]};
  if(pd.crew)body.crew=D.crew;
  pd.crewPax.forEach(function(id){body.crewPax.push({id:id,base:D.crewPax[id].base,val:D.crewPax[id].val})});
  saving=true;$('aSave').disabled=true;$('aSave').textContent='กำลัง SAVE…';
  var sent=JSON.parse(JSON.stringify(D));
  return api(body).then(function(res){return afterSaveRes(res,sent,pd,'admin')},function(){toast('ติดต่อ Google Sheet ไม่ได้ ลองกด SAVE อีกครั้ง',true);return false})
  .then(function(ok){return afterSave(ok,'admin',retry,doAdminSave)});
}
$('aSave').addEventListener('click',function(){doAdminSave()});

/* ----- events for the history sheets ----- */
function logEvent(what,detail){if(!curId)return;api({action:'log',id:curId,mt:mtok[curId],at:view==='admin'?atok:undefined,by:$('whoP').value.trim(),what:what,detail:detail||''}).catch(function(){})}

/* ----- PREVIEW / PDF ----- */
function infoCell(label,val,wide){var d=el('div',wide?'wide':null);d.appendChild(el('small',null,label));d.appendChild(el('b',null,val||'-'));return d}
function reportNode(isPreview,mode){
  var crewMode=mode==='crew',r=el('div','report'),h=el('div','blk');
  h.appendChild(el('h1',null,crewMode?'SEAT PLAN A340 · ผังที่นั่งลูกเรือ (CREW)':'SEAT PLAN A340 · ผังที่นั่งผู้โดยสาร'));
  var g=el('div','rinfo');
  g.appendChild(infoCell('AIRCRAFT','A340'));g.appendChild(infoCell('SECTOR',getInfo('sectorNo')?'Sector '+getInfo('sectorNo'):''));
  g.appendChild(infoCell('MISSION / ภารกิจ',getInfo('name'),true));g.appendChild(infoCell('FLIGHT',getInfo('flight')));
  g.appendChild(infoCell('ROUTE',getInfo('route')));g.appendChild(infoCell('DATE',getInfo('date')));g.appendChild(infoCell('GATE',getInfo('gate')));g.appendChild(infoCell('BOARDING TIME',getInfo('time')));
  h.appendChild(g);
  var meta=el('div','rmeta');var b=bkk();
  meta.appendChild(el('span',null,'ออกรายงาน '+b.d+' '+MON[b.M-1]+' '+String(b.y).slice(2)+' / '+p2(b.h)+':'+p2(b.m)+' TH-LT'));
  var ls=M.lastSave;meta.appendChild(el('span',null,ls&&ls.at?'SAVE ล่าสุด '+[ls.by,fmtTH(ls.at)].filter(Boolean).join(' · '):'ยังไม่เคย SAVE'));
  meta.appendChild(el('span',null,'สภาพที่นั่ง/จอ ตามไฟล์ Seat Plan 340 (For Admin)'));
  h.appendChild(meta);
  var np=pending(crewMode?'admin':'pax').n;if(isPreview&&np)h.appendChild(el('div','rwarn','ตัวอย่างนี้เป็นค่าก่อนกด SAVE (SAVE ล่าสุด) ยังไม่รวมการแก้ไข '+np+' รายการที่ยังไม่ได้ SAVE'));
  var lg=$('legend').cloneNode(true);lg.removeAttribute('id');h.appendChild(lg);
  r.appendChild(h);
  var tmp=el('div');buildZones(tmp,true,crewMode?'crew':'pax');
  [].slice.call(tmp.children).forEach(function(z){z.classList.add('blk');z.setAttribute('inert','');r.appendChild(z)});
  var list=manifestRows(crewMode?'crew':'pax'),CH=32,title=crewMode?'รายชื่อลูกเรือ':'รายชื่อผู้โดยสาร';
  if(!list.length){var e=el('div','blk');e.appendChild(el('h2',null,title));e.appendChild(el('p','rsub','ยังไม่มีรายชื่อ'));r.appendChild(e)}
  for(var i=0;i<list.length;i+=CH){
    var blk=el('div','blk');blk.appendChild(el('h2',null,title+' ('+list.length+' คน)'+(i?' ต่อ':'')));
    var mt=el('table','manifest');mt.innerHTML=manifestHead();var tb=el('tbody');
    list.slice(i,i+CH).forEach(function(rw){tb.appendChild(manifestRow(rw,true))});mt.appendChild(tb);blk.appendChild(mt);r.appendChild(blk);
  }
  return r;
}
var pvMode='pax';
function openPreview(){pvMode=view==='admin'?'crew':'pax';useSaved=true;var node;try{node=reportNode(true,pvMode)}finally{useSaved=false}
  $('pvTitle').textContent=pvMode==='crew'?'PREVIEW ผังที่นั่งลูกเรือ':'PREVIEW ผังที่นั่ง';
  var host=$('pvBody');host.textContent='';host.appendChild(node);showDlg($('pv'));logEvent('PREVIEW',pvMode==='crew'?'ผังที่นั่งลูกเรือ':'ผังที่นั่งผู้โดยสาร')}
$('bPreview').addEventListener('click',function(){if(M)guard('PREVIEW',openPreview)});
$('aPreview').addEventListener('click',function(){if(M)guard('PREVIEW',openPreview)});
$('pvClose').addEventListener('click',function(){hideDlg($('pv'))});
$('pvPdf').addEventListener('click',function(){exportPdf(pvMode)});
$('bPdf').addEventListener('click',function(){if(M)guard('EXPORT TO PDF',function(){exportPdf('pax')})});
$('aPdf').addEventListener('click',function(){if(M)guard('EXPORT TO PDF',function(){exportPdf('crew')})});

var libs={};
function loadLib(src){if(!libs[src])libs[src]=new Promise(function(ok,no){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=function(){delete libs[src];no(new Error('load'))};document.head.appendChild(s)});return libs[src]}
function offerFile(name,data,mime){
  var url=URL.createObjectURL(new Blob([data],{type:mime})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},4000);
  toast('ดาวน์โหลด '+name);
}
var busy=false;
function exportPdf(mode){
  if(busy||!M)return;busy=true;toast('กำลังสร้าง PDF…'+(pending(mode==='crew'?'admin':'pax').n?' (ค่าก่อน SAVE)':''));
  var name;useSaved=true;var wrap=el('div','offscreen'),node;try{node=reportNode(false,mode);name=fileName(mode==='crew'?'CREW':'Pax')}finally{useSaved=false}
  wrap.appendChild(node);document.body.appendChild(wrap);
  Promise.all([loadLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),document.fonts?document.fonts.ready:null])
  .then(function(){
    var blks=[].slice.call(node.querySelectorAll(':scope > .blk'));
    return blks.reduce(function(p,b){return p.then(function(arr){return html2canvas(b,{scale:2,backgroundColor:'#ffffff',logging:false}).then(function(cv){arr.push(cv);return arr})})},Promise.resolve([]));
  })
  .then(function(cvs){
    var pdf=new window.jspdf.jsPDF({orientation:'p',unit:'mm',format:'a4'});
    pdf.setProperties({title:name.replace(/\.pdf$/,'')});
    var Mg=10,W=210-2*Mg,H=297-2*Mg,y=Mg,first=true;
    cvs.forEach(function(cv){
      var mmPerPx=W/cv.width,hmm=cv.height*mmPerPx;
      if(hmm<=H){if(y+hmm>Mg+H&&!first){pdf.addPage();y=Mg}
        pdf.addImage(cv.toDataURL('image/jpeg',0.92),'JPEG',Mg,y,W,hmm);y+=hmm+4;first=false;return}
      var pxPage=Math.floor(H/mmPerPx),off=0;if(!first){pdf.addPage();y=Mg}
      while(off<cv.height){var hh=Math.min(pxPage,cv.height-off),s=document.createElement('canvas');s.width=cv.width;s.height=hh;
        s.getContext('2d').drawImage(cv,0,off,cv.width,hh,0,0,cv.width,hh);if(off>0){pdf.addPage();y=Mg}
        pdf.addImage(s.toDataURL('image/jpeg',0.92),'JPEG',Mg,y,W,hh*mmPerPx);y+=hh*mmPerPx+4;off+=hh}
      first=false;
    });
    offerFile(name,pdf.output('arraybuffer'),'application/pdf');
    logEvent('EXPORT TO PDF',name);
  })
  .catch(function(e){if(window.console)console.error('EXPORT TO PDF',e);toast('สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง',true)})
  .then(function(){wrap.remove();busy=false});
}

/* ----- EXPORT TO EXCEL (แก้ไขได้ หน้าตาและการแบ่งหน้าเหมือน PDF) ----- */
function excelModel(mode,blank){
  var crewMode=mode==='crew',set=crewRows(getCrew()),stats=zoneStats();
  var seatObj=function(id,label,mon){var st=status(id),crew=!!set[SEAT[id].row];
    var p=crew?(crewMode?getCrewPax(id):null):getPax(id);
    return {label:label,s:st.s,mon:mon?st.m:null,crew:crew,name:p?shortName(p):''}};
  var zones=ZONES.map(function(z){var v=stats[z.key],free=crewMode?(blank?v.crew:v.crewFree):(blank?v.t-v.crew:v.free);
    return {title:z.title,free:free,freeLabel:crewMode?(v.crew?'ที่นั่งลูกเรือว่าง ':'ไม่มี CREW ZONE'):'ที่นั่งว่าง ',noCount:crewMode&&!v.crew,items:z.items.map(function(it){
      if(it.cc)return {type:'cc',crew:!!set.CC,seat:seatObj('CC','CC',true)};
      if(it.ovh)return {type:'ovh',crew:!!set[it.ovh],mon:['L','C','R'].map(function(p){return status('MON-'+it.ovh+'-'+p).m})};
      return {type:'row',n:String(it.n),crew:!!set[String(it.n)],groups:it.g.map(function(g){return g.split('').map(function(L){return L==='_'?null:seatObj(it.n+L,L,it.mon)})})};
    })}});
  var b=bkk(),ls=M.lastSave;
  var meta=['ออกรายงาน '+b.d+' '+MON[b.M-1]+' '+String(b.y).slice(2)+' / '+p2(b.h)+':'+p2(b.m)+' TH-LT',
    ls&&ls.at?'SAVE ล่าสุด '+[ls.by,fmtTH(ls.at)].filter(Boolean).join(' · '):'ยังไม่เคย SAVE','สภาพที่นั่ง/จอ ตามไฟล์ Seat Plan 340 (For Admin)'].join('   ·   ');
  return {
    title:(crewMode?'SEAT PLAN A340 · ผังที่นั่งลูกเรือ (CREW)':'SEAT PLAN A340 · ผังที่นั่งผู้โดยสาร')+(blank?' · ฟอร์มเปล่า':''),
    sheetName:crewMode?'Seat Plan (CREW)':'Seat Plan (Pax)',docTitle:'Seat Plan A340',blank:blank,blankRows:32,
    info:[[{label:'AIRCRAFT',val:'A340'},{label:'SECTOR',val:getInfo('sectorNo')?'Sector '+getInfo('sectorNo'):''},{label:'MISSION / ภารกิจ',val:getInfo('name'),span:2}],
      [{label:'FLIGHT',val:getInfo('flight')},{label:'ROUTE',val:getInfo('route')},{label:'DATE',val:getInfo('date')},{label:'GATE',val:getInfo('gate')}],
      [{label:'BOARDING TIME',val:getInfo('time')}]],
    meta:meta,
    legend:'สัญลักษณ์: ช่องสีฟ้า = มีชื่อแล้ว · ช่องแดงอ่อน × = ที่นั่งใช้ไม่ได้ · เส้นเหลืองหนาใต้ช่อง ! = ที่นั่งขัดข้องแต่ใช้ได้ · เส้นบนช่อง / แถบ Monitor สีเขียว เหลือง แดง = จอ ปกติ เสื่อม เสีย · กรอบแดง CREW ZONE = กันไว้ให้ลูกเรือ'+(blank?' · ช่องใต้ตัวอักษรที่นั่งไว้กรอกชื่อ':''),
    zones:zones,listTitle:crewMode?'รายชื่อลูกเรือ':'รายชื่อผู้โดยสาร',
    list:manifestRows(crewMode?'crew':'pax').map(function(r){return {id:r.id,zone:r.zone,th:thFull(r.p),en:enFull(r.p)}}),
    footer:[getInfo('flight'),getInfo('date'),'Seat Plan A340'].filter(Boolean).join(' · ')
  };
}
var xlMode='pax';
function askExcel(mode){xlMode=mode;$('xlSub').textContent=(mode==='crew'?'ผังที่นั่งลูกเรือ':'ผังที่นั่งผู้โดยสาร')+' แบบแก้ไขได้ หน้าตาและการแบ่งหน้าเหมือนไฟล์ PDF';showDlg($('xlDlg'))}
$('xlNo').addEventListener('click',function(){hideDlg($('xlDlg'))});
$('xlFull').addEventListener('click',function(){hideDlg($('xlDlg'));exportExcel(xlMode,false)});
$('xlBlank').addEventListener('click',function(){hideDlg($('xlDlg'));exportExcel(xlMode,true)});
function exportExcel(mode,blank){
  if(busy||!M)return;busy=true;toast('กำลังสร้างไฟล์ Excel…');
  var model,name;useSaved=true;
  try{model=excelModel(mode,blank);name=fileName((mode==='crew'?'CREW':'Pax')+(blank?' Blank Form':''),'xlsx')}finally{useSaved=false}
  loadLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
  .then(function(){return window.SeatExcel.build(model)})
  .then(function(blob){offerFile(name,blob,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');logEvent('EXPORT TO EXCEL',name)})
  .catch(function(e){if(window.console)console.error('EXPORT TO EXCEL',e);toast('สร้างไฟล์ Excel ไม่สำเร็จ ลองอีกครั้ง',true)})
  .then(function(){busy=false});
}
$('bXls').addEventListener('click',function(){if(M)guard('EXPORT TO EXCEL',function(){askExcel('pax')})});
$('aXls').addEventListener('click',function(){if(M)guard('EXPORT TO EXCEL',function(){askExcel('crew')})});
$('pvXls').addEventListener('click',function(){askExcel(pvMode)});

/* ----- ADMIN ----- */
(function(){var f=$('crewFront'),r=$('crewRear');
  f.appendChild(new Option('ไม่กั้นจากหัวเครื่อง',''));r.appendChild(new Option('ไม่กั้น',''));
  function lbl(k){return 'แถว '+k+'  ('+zoneOf(SEAT[SEATS.filter(function(s){return SEAT[s].row===k})[0]].zone).title+')'}
  var g1=document.createElement('optgroup'),g2=document.createElement('optgroup');
  g1.label='เริ่มจากห้อง Mission Commander';g2.label='เริ่มจากแถว 1 (ไม่รวมห้อง Mission Commander)';
  g1.appendChild(new Option('ห้อง Mission Commander เท่านั้น','CC'));
  ROWS.forEach(function(k,i){if(i){g1.appendChild(new Option('Mission Commander ถึง'+lbl(k),'CC-'+k));g2.appendChild(new Option('ถึง'+lbl(k),k))}});
  f.appendChild(g1);f.appendChild(g2);
  ROWS.slice().reverse().forEach(function(k){if(k!=='CC')r.appendChild(new Option(lbl(k),k))});
})();
function renderAdmin(){var c=getCrew();$('crewFront').value=c.front;$('crewRear').value=c.rear;
  $('crewFront').disabled=$('crewRear').disabled=closed();
  [['crewFront',D&&D.crew&&D.crew.front!==savedCrew().front],['crewRear',D&&D.crew&&D.crew.rear!==savedCrew().rear]].forEach(function(x){
    if(x[1])$(x[0]).dataset.pending='1';else delete $(x[0]).dataset.pending})}
$('bAdmin').addEventListener('click',function(){
  if(!M)return;
  if(view==='admin'){setView('pax');window.scrollTo(0,0);return}
  if(atok&&M.crewPax){setView('admin');window.scrollTo(0,0);return}
  credDialog({title:'เข้าหน้า ADMIN',sub:'Login ด้วยข้อมูลใน LOGIN DATABASE',yes:'Login',wait:{mt:mtok[curId]},
    submit:function(d){return api({action:'admin.login',id:curId,mt:mtok[curId],cred:d.cred})},
    done:function(res){atok=res.at;admUser=res.user||'';admMission=curId;saveAuth();toast('เข้าหน้า ADMIN แล้ว ใช้ได้ถึง '+hm(clockX)+' น.');
      load().then(function(){if(atok){setView('admin');window.scrollTo(0,0)}})}});
});
$('aLogout').addEventListener('click',function(){
  if(pending('admin').n){ask('ยังไม่ได้ SAVE','มีการแก้ไขในหน้า ADMIN '+pending('admin').n+' รายการที่ยังไม่ได้ SAVE ถ้า LOGOUT รายการเหล่านี้จะยังค้างอยู่ในเครื่องนี้ (ใช้ต่อได้เมื่อ Login ใหม่)','LOGOUT',adminLogout);return}
  adminLogout();
});
function adminLogout(){var t=atok;dropAdmin();setView('pax');window.scrollTo(0,0);toast('ออกจากหน้า ADMIN แล้ว');
  if(t)api({action:'admin.logout',id:curId,at:t,vt:vtok||undefined,why:'กด LOGOUT'}).catch(function(){})}
function changeCrew(){
  if(closed())return;
  var nc={front:$('crewFront').value,rear:$('crewRear').value};
  var ff=crewFront(nc.front),ri=ROWS.indexOf(nc.rear);
  if(ff&&ri>0&&ff.end>=ri){toast('กั้นจากหัวเครื่องและท้ายเครื่องซ้อนกัน เลือกแถวใหม่',true);renderAdmin();return}
  var set=crewRows(nc),hit=SEATS.filter(function(id){return set[SEAT[id].row]&&M.pax[id]&&!isEmpty(M.pax[id])});
  function apply(){if(!D.crew)D.crewBase=savedCrew();D.crew=nc;cleanDraft();persistDraft();renderAll();toast('ตั้ง CREW ZONE แล้ว กด SAVE เพื่อบันทึก')}
  if(hit.length)ask('มีผู้โดยสารในแถวที่จะกั้น','ที่นั่ง '+hit.join(', ')+' มีรายชื่อผู้โดยสารอยู่ เมื่อกด SAVE รายชื่อในที่นั่งเหล่านี้จะถูกล้างออก','กั้นที่นั่ง',apply,renderAdmin);
  else apply();
}
$('crewFront').addEventListener('change',changeCrew);$('crewRear').addEventListener('change',changeCrew);

/* ----- PRINT BOARDING PASS ----- */
var bpList=[],bpMode='pax';
function openBp(){
  if(!M)return;bpMode=view==='admin'?'crew':'pax';
  useSaved=true;try{
    var info={};['flight','sectorNo','route','date','gate','time','note'].forEach(function(k){info[k]=getInfo(k)});
    bpList=manifestRows(bpMode).map(function(r){var p=r.p;p.seat=r.id;
      return {id:r.id,zone:SEAT[r.id].zone,label:shortName(p),d:window.BoardingPass.data(p,info,zoneOf(SEAT[r.id].zone).name)}});
  }finally{useSaved=false}
  $('bpTitle').textContent=bpMode==='crew'?'PRINT BOARDING PASS · ลูกเรือ':'PRINT BOARDING PASS · ผู้โดยสาร';
  $('bpSub').textContent=bpMode==='crew'?'เฉพาะลูกเรือใน CREW ZONE':'เฉพาะผู้โดยสาร ไม่รวมลูกเรือและที่นั่งใน CREW ZONE';
  var zh=$('bpZones');zh.textContent='';
  ZONES.forEach(function(z){var n=bpList.filter(function(it){return it.zone===z.key}).length;if(!n)return;
    var l=el('label','chk'),c=el('input');c.type='checkbox';c.checked=true;c.value=z.key;c.dataset.zone='1';
    l.appendChild(c);l.appendChild(el('span',null,z.title));l.appendChild(el('span','muted',' ('+n+')'));zh.appendChild(l)});
  var host=$('bpList');host.textContent='';
  bpList.forEach(function(it){var l=el('label','chk'),c=el('input');c.type='checkbox';c.checked=true;c.value=it.id;
    l.appendChild(c);l.appendChild(el('span','sid',it.id));l.appendChild(el('span','nmx',it.label));host.appendChild(l)});
  if(!bpList.length)host.appendChild(el('p','empty',bpMode==='crew'?'ยังไม่มีรายชื่อลูกเรือที่ SAVE แล้ว':'ยังไม่มีผู้โดยสารที่ SAVE แล้ว'));
  showDlg($('bpDlg'));bpRender();
}
function bpSelected(){var on={};[].forEach.call($('bpList').querySelectorAll('input:checked'),function(c){on[c.value]=1});return bpList.filter(function(it){return on[it.id]})}
function bpRender(){
  var sel=bpSelected(),paper=$('bpPaper').value;
  $('bpAll').checked=sel.length===bpList.length&&sel.length>0;$('bpAll').indeterminate=sel.length>0&&sel.length<bpList.length;
  [].forEach.call($('bpZones').querySelectorAll('input'),function(c){var all=bpList.filter(function(it){return it.zone===c.value}),on=sel.filter(function(it){return it.zone===c.value});
    c.checked=on.length===all.length&&all.length>0;c.indeterminate=on.length>0&&on.length<all.length});
  var sheets=paper==='card'?sel.length:Math.ceil(sel.length/3);
  $('bpCount').textContent=sel.length+' ใบ · '+sheets+' แผ่น';$('bpPrint').disabled=!sel.length;
  var pv=$('bpPv');
  if(!sel.length){pv.textContent='';pv.appendChild(el('p','empty','เลือกอย่างน้อย 1 คน'));return}
  var res=window.BoardingPass.preview(pv,sel.map(function(it){return it.d}),paper,2);
  if(res.shown<sel.length)pv.appendChild(el('p','empty','ตัวอย่างแสดง '+res.shown+' จาก '+sel.length+' ใบ'));
}
$('bpList').addEventListener('change',bpRender);
$('bpZones').addEventListener('change',function(e){var c=e.target;if(!c.dataset.zone)return;
  [].forEach.call($('bpList').querySelectorAll('input'),function(x){var it=bpList.filter(function(i){return i.id===x.value})[0];if(it&&it.zone===c.value)x.checked=c.checked});bpRender()});
$('bpAll').addEventListener('change',function(){var v=$('bpAll').checked;[].forEach.call($('bpList').querySelectorAll('input'),function(c){c.checked=v});bpRender()});
$('bpPaper').addEventListener('change',bpRender);
$('bpClose').addEventListener('click',function(){hideDlg($('bpDlg'))});
$('bpPrint').addEventListener('click',function(){var sel=bpSelected();if(!sel.length)return;
  toast('กำลังเตรียมพิมพ์ '+sel.length+' ใบ…');window.BoardingPass.print(sel.map(function(it){return it.d}),$('bpPaper').value);
  logEvent('PRINT BOARDING PASS',(bpMode==='crew'?'ลูกเรือ ':'ผู้โดยสาร ')+sel.length+' ใบ: '+sel.map(function(it){return it.id}).join(', '))});
$('bBp').addEventListener('click',function(){if(M)guard('PRINT BOARDING PASS',openBp)});
$('aBp').addEventListener('click',function(){if(M)guard('PRINT BOARDING PASS',openBp)});
window.addEventListener('resize',function(){if($('bpDlg').open)bpRender()});

/* =====================================================================
   routing + start
   ===================================================================== */
function route(first){
  if(!API){$('pageMissions').hidden=false;$('pagePlan').hidden=true;hideGate();
    var n=$('noticeM');n.hidden=false;n.textContent='ยังไม่ได้ตั้งค่า API_URL ใน config.js หน้านี้จึงยังไม่เชื่อมกับ Google Sheet (ดู README)';return}
  if(!sess){showGate('');return}
  var m=/^#m=([^&]+)/.exec(location.hash),id=m?decodeURIComponent(m[1]):null;
  if(id&&mtok[id])showPlan(id);
  else{if(id)pendingOpen=id;if(location.hash)history.replaceState(null,'',location.pathname+location.search);showMissions(first)}
}
$('backLink').addEventListener('click',function(e){e.preventDefault();
  var n=pending('pax').n+pending('admin').n;
  function go(){location.hash=''}
  if(n)ask('ออกจากภารกิจ','มี '+n+' รายการที่ยังไม่ได้ SAVE รายการเหล่านี้จะค้างอยู่ในเครื่องนี้ (กลับเข้ามาแล้ว SAVE ได้) ออกจากภารกิจเลยหรือไม่','ออกจากภารกิจ',go);else go()});
window.addEventListener('hashchange',function(){route(false)});
window.addEventListener('beforeunload',function(e){if(pending('pax').n||pending('admin').n){e.preventDefault();e.returnValue=''}});
setInterval(function(){
  if(document.hidden||!$('gate').hidden||anyDialogOpen()||!sess)return;
  if(!$('pageMissions').hidden)loadMissions();
},30000);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&curId&&sess&&!saving&&$('gate').hidden&&!anyDialogOpen())load()});

/* =====================================================================
   13. การเข้าใช้งาน: ถามระบบทุก 10 วินาที · ขอเข้าซ้อน · นาฬิกา 90 นาที · ออกจากระบบ
   ===================================================================== */
var pingT=null,pingBusy=false;
function startPing(){if(!pingT)pingT=setInterval(ping,10000);setTimeout(ping,500)}
function ping(){
  if(!sess||pingBusy||!$('gate').hidden)return;pingBusy=true;
  var b={action:'ping',s:sess,at:atok||undefined,vt:vtok||undefined};
  if(curId&&M&&!$('pagePlan').hidden){b.id=curId;b.mt=mtok[curId]}
  api(b).then(function(r){
    if(!r||authFail(r)||!r.ok)return;
    if(r.x)clockX=r.x;if(r.now)srvOff=r.now-Date.now();
    if(r.adminGone&&atok){var was=view==='admin';dropAdmin();if(was)setView('pax');ask('ออกจากหน้า ADMIN',r.adminGone,'',null)}
    if(r.viewGone&&vtok){vtok='';if(mtab!=='open')setTab('open');ask('ดูภารกิจที่เสร็จสิ้น / ภารกิจทั้งหมด',r.viewGone,'',null)}
    showTkAsk(r.takeover);
    if(r.mpw&&curId&&M)mpwChanged();
    else if(curId&&M&&b.id===curId)seenSave(r.lastSave);
    saveAuth();paintAcct();
  }).catch(function(){}).then(function(){pingBusy=false});
}
/* this window is asked to give way (13.4.2): 10 seconds to say no */
var tkaInt=null,tkaUntil=0;
function showTkAsk(t){
  if(!t){if($('tkAsk').open){hideDlg($('tkAsk'));clearInterval(tkaInt)}return}
  tkaUntil=Date.now()+t.left;
  $('tkaMsg').textContent=t.type==='u'?
    'มีผู้ Login เข้าใช้งานด้วย Username นี้จากเครื่องอื่น บัญชีของคุณจะถูกออกจากระบบอัตโนมัติ… หากไม่ใช่คุณ ให้กด “ไม่อนุญาต” แล้วติดต่อ Admin':
    'มีผู้เข้าใช้งานด้วยบัญชี Google นี้ ('+email+') จากเครื่องอื่น บัญชีของคุณจะถูกออกจากระบบอัตโนมัติ… หากไม่ใช่คุณ ให้กด “ไม่อนุญาต” แล้วเปลี่ยนรหัสผ่าน Gmail และออกจากระบบ Google ทุกอุปกรณ์';
  function paint(){var s=Math.ceil((tkaUntil-Date.now())/1000);
    $('tkaCount').textContent=s>0?'ออกจากระบบใน '+s+' วินาที':'กำลังออกจากระบบ…';
    if(s<=0){clearInterval(tkaInt);setTimeout(ping,2500)}}
  clearInterval(tkaInt);paint();tkaInt=setInterval(paint,250);$('tkaNo').disabled=false;
  if(!$('tkAsk').open)showDlg($('tkAsk'));
}
$('tkAsk').addEventListener('cancel',function(e){e.preventDefault()});
$('tkaNo').addEventListener('click',function(){$('tkaNo').disabled=true;
  api({action:'takeover.deny',s:sess,at:atok||undefined,vt:vtok||undefined}).then(function(r){
    if(authFail(r))return;clearInterval(tkaInt);hideDlg($('tkAsk'));
    toast('ไม่อนุญาตแล้ว ใช้งานต่อได้ ถ้าไม่ใช่คุณที่พยายามเข้าใช้งาน ให้ติดต่อ Admin')},function(){$('tkaNo').disabled=false;toast('ติดต่อระบบไม่ได้ ลองอีกครั้ง',true)})});
/* this window waits for the other one (13.4.2): ask the server every 2.5 seconds */
var tkActive=null,tkCount=null;
function stopTk(){tkActive=null;clearInterval(tkCount);tkCount=null;if($('tkWait').open)hideDlg($('tkWait'))}
function waitTakeover(res,extra,ok,fail){
  stopTk();var my={},t0=Date.now(),pt=res.pt;tkActive=my;
  $('tkwMsg').textContent=(res.wait&&res.wait.type==='u'?'Username นี้':'บัญชี Google นี้')+'กำลังใช้งานอยู่ที่เครื่องอื่น ระบบแจ้งเครื่องเดิมแล้ว ถ้าเครื่องเดิมไม่กด “ไม่อนุญาต” ภายใน 10 วินาที หรือปิดไปแล้ว คุณจะได้เข้าใช้งาน (รอไม่เกินประมาณ 30 วินาที)';
  function paint(){$('tkwCount').textContent='รอแล้ว '+Math.floor((Date.now()-t0)/1000)+' วินาที'}
  paint();tkCount=setInterval(paint,500);showDlg($('tkWait'));
  $('tkwNo').onclick=function(){stopTk();fail('ยกเลิกการเข้าใช้งานแล้ว')};
  (function poll(){setTimeout(function(){if(tkActive!==my)return;
    var b={action:'takeover.poll',pt:pt};if(sess)b.s=sess;for(var k in extra)if(extra[k]!==undefined)b[k]=extra[k];
    rawApi(b).then(function(r){if(tkActive!==my)return;
      if(r&&r.error==='takeover_wait'){poll();return}
      stopTk();if(r&&r.ok){ok(r);return}
      if(r&&(r.error==='session'||r.error==='kicked'||r.error==='blocked_out')){authFail(r);return}
      fail((r&&r.message)||'เข้าใช้งานไม่สำเร็จ')},function(){if(tkActive===my)poll()})},2500)})();
}
$('tkWait').addEventListener('cancel',function(e){e.preventDefault()});
/* 13.6 one clock: warn 5 minutes before the end, "ใช้งานต่อ" adds 90 minutes */
var expWarned=0,expDismissed=0;
function paintAcct(){
  [].forEach.call(document.querySelectorAll('.acctinfo'),function(x){x.textContent='';
    if(!sess)return;if(email)x.appendChild(document.createTextNode(email+' · '));
    if(clockX){x.appendChild(document.createTextNode('ใช้ได้ถึง '));x.appendChild(el('b',null,hm(clockX)+' น.'))}});
}
function paintExp(){var left=Math.max(0,clockX-srvNow()),m=Math.floor(left/60000),s=Math.floor(left%60000/1000);
  $('expMsg').textContent='Account ของคุณจะหมดเวลาใช้งานในอีก '+m+':'+p2(s)+' นาที (เวลา '+hm(clockX)+' น.) หากต้องการใช้งานต่อ ให้กดปุ่ม “ต้องการใช้งานต่อ” จะใช้ได้ต่ออีก 90 นาที ถึงเวลา '+hm(clockX+90*60000)+' น.'}
setInterval(function(){
  if(!sess||!clockX)return;
  var left=clockX-srvNow();
  if(left<=0){forceOut('หมดเวลาใช้งาน ('+hm(clockX)+' น.) ให้เข้าสู่ระบบใหม่ · สิ่งที่กรอกแต่ยังไม่ได้ SAVE ยังอยู่ในเครื่องนี้');return}
  if(left<=5*60000&&expWarned!==clockX&&expDismissed!==clockX){expWarned=clockX;paintExp();showDlg($('expDlg'))}
  if($('expDlg').open)paintExp();
},1000);
$('expNo').addEventListener('click',function(){expDismissed=clockX;hideDlg($('expDlg'));toast('จะออกจากระบบเมื่อ '+hm(clockX)+' น.')});
$('expYes').addEventListener('click',function(){$('expYes').disabled=true;
  api({action:'extend',s:sess,mts:mtok,at:atok||undefined,vt:vtok||undefined}).then(function(r){$('expYes').disabled=false;
    if(authFail(r))return;if(!r||!r.ok){toast((r&&r.message)||'ต่อเวลาไม่สำเร็จ ลองอีกครั้ง',true);return}
    sess=r.s;clockX=r.x;if(r.now)srvOff=r.now-Date.now();Object.keys(r.mts||{}).forEach(function(id){mtok[id]=r.mts[id]});
    if(atok)atok=r.at||'';if(vtok)vtok=r.vt||'';if(!atok)dropAdmin();
    saveAuth();paintAcct();hideDlg($('expDlg'));toast('ใช้งานต่อได้ถึงเวลา '+hm(clockX)+' น.')},
  function(){$('expYes').disabled=false;toast('ติดต่อระบบไม่ได้ ลองอีกครั้ง',true)})});
/* 13.1 ออกจากระบบ: ask first when there are unsaved items */
function draftKeys(){var out=[];try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('pax-a340-draft2-')===0)out.push(k)}}catch(e){}return out}
var loKeys=[];
function askLogout(){
  var n=curId&&D?pending('pax').n+pending('admin').n:0;
  if(n){loKeys=[draftKey(curId)];$('loMsg').textContent='มี '+n+' รายการที่ยังไม่ได้ SAVE ในภารกิจนี้ เลือกว่าจะ SAVE ก่อน หรือทิ้งรายการเหล่านี้ แล้วออกจากระบบ';
    $('loSave').hidden=closed();showDlg($('loDlg'));return}
  loKeys=draftKeys();
  if(loKeys.length){$('loMsg').textContent='มีรายการที่ยังไม่ได้ SAVE ค้างอยู่ในเครื่องนี้ '+loKeys.length+' ภารกิจ ถ้าต้องการ SAVE ให้กด “ยกเลิก” แล้วเข้าภารกิจนั้นเพื่อ SAVE ก่อน';
    $('loSave').hidden=true;showDlg($('loDlg'));return}
  logoutNow();
}
[].forEach.call(document.querySelectorAll('.logout'),function(b){b.addEventListener('click',askLogout)});
$('loNo').addEventListener('click',function(){hideDlg($('loDlg'))});
$('loDrop').addEventListener('click',function(){hideDlg($('loDlg'));loKeys.forEach(function(k){try{localStorage.removeItem(k)}catch(e){}});D=curId?loadDraft(curId):D;logoutNow()});
$('loSave').addEventListener('click',function(){hideDlg($('loDlg'));
  var a=pending('pax').n?doSave():Promise.resolve(true);
  a.then(function(ok){if(!ok)return false;return pending('admin').n?(atok?doAdminSave():(toast('ต้อง Login หน้า ADMIN เพื่อ SAVE รายการลูกเรือ',true),false)):true})
   .then(function(ok){if(ok&&!pending('pax').n&&!pending('admin').n)logoutNow()})});
function logoutNow(){
  if(sess)api({action:'logout',s:sess,at:atok||undefined,vt:vtok||undefined,why:'กด ออกจากระบบ'}).catch(function(){});
  forceOut('ออกจากระบบแล้ว');$('gateErr').classList.add('info');
}
/* closing or reloading this tab: tell the server, so another window does not have to wait (a reload pings again at once) */
window.addEventListener('pagehide',function(){if(!sess||!API||!navigator.sendBeacon)return;
  try{navigator.sendBeacon(API,new Blob([JSON.stringify({action:'bye',s:sess,w:wid})],{type:'text/plain;charset=utf-8'}))}catch(e){}});
/* each tab its own window id; a duplicated tab (copied sessionStorage) must not share it */
var bc=null;try{bc=new BroadcastChannel('sp-a340-w')}catch(e){bc=null}
if(bc)bc.addEventListener('message',function(e){var d=e.data||{};if(d.q==='who'&&wid&&d.w===wid)bc.postMessage({a:'me',w:wid})});
function initWid(){return new Promise(function(done){
  var w=sstore(WIDK);
  if(!w||!bc){wid=w||newWid();sstore(WIDK,wid);done();return}
  var dup=false,h=function(e){var d=e.data||{};if(d.a==='me'&&d.w===w)dup=true};
  bc.addEventListener('message',h);bc.postMessage({q:'who',w:w});
  setTimeout(function(){bc.removeEventListener('message',h);
    if(dup){wid=newWid();sstore(WIDK,wid);sstore(AUTH,null)}else wid=w;done()},300)})}
setInterval(paintAcct,30000);

var NEED_API=3,oldApi=false,OLD_API_MSG='ระบบหลังบ้าน (Apps Script) ยังเป็นรุ่นเก่า ยังเข้าใช้งานไม่ได้ ให้ผู้ดูแลวางโค้ด apps-script/Code.gs ล่าสุด แล้ว Deploy เป็น New version (เปิดลิงก์ /exec ต้องเห็น "api":3)';   // รุ่นของ Code.gs ที่หน้าเว็บนี้ต้องใช้
function start(){
  if(!API){route();return}
  initWid().then(function(){
    restoreAuth();
    rawApi({action:'config'}).then(function(res){clientId=res&&res.googleClientId||'';
      if(!res||res.api!==NEED_API){oldApi=true;sess='';sstore(AUTH,null);
        if(res&&!res.ok)OLD_API_MSG='ระบบหลังบ้านตอบข้อผิดพลาด: '+(res.message||res.error||'ไม่ทราบสาเหตุ')+' (ลิงก์ '+API.slice(-12)+')';
        else OLD_API_MSG+=' · ลิงก์ที่หน้าเว็บใช้ลงท้าย '+API.slice(-12)+' ตอบรุ่น '+(res&&res.api||'เก่า');
        showGate(OLD_API_MSG);return}
      if(sess){route(false);startPing()}else route(true)},function(){showGate('ติดต่อระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วโหลดหน้าใหม่')});
  });
}
start();
})();
