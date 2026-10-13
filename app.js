/* Seat Plan A340 · Passenger
 * Pages: mission list (no hash) and seat plan of one mission (#m=<id>). Both sit behind the PIN gate.
 * Edits are drafts on this device (localStorage, per mission) until SAVE writes them to the mission tab in Google Sheet.
 * Seat and monitor condition is read live from "Seat Plan 340 (For Admin)" by the Apps Script. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function showDlg(d){if(d.showModal)d.showModal();else d.setAttribute('open','')}
function hideDlg(d){if(d.close)d.close();else d.removeAttribute('open')}
function anyDialogOpen(){return !!document.querySelector('dialog[open]')}

var CFG=window.SEATPLAN_CONFIG||{};
var DEMO=/[?&]demo=1\b/.test(location.search);
var API=String(CFG.API_URL||'').trim();
var PIN_KEY='pax-a340-pin',memPin='';
function getPin(){try{return sessionStorage.getItem(PIN_KEY)||memPin}catch(e){return memPin}}
function setPin(p){memPin=p;try{if(p)sessionStorage.setItem(PIN_KEY,p);else sessionStorage.removeItem(PIN_KEY)}catch(e){}}
function api(body){
  body.pin=getPin();
  if(DEMO)return window.DEMO_API(JSON.parse(JSON.stringify(body)));
  return fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(function(r){return r.json()});
}

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
var INFO_KEYS=['name','flight','sector','date','gate','time','note'];
var UPPER={flight:1,sector:1,gate:1,date:1};
var MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/* Thai rank abbreviation -> English abbreviation (auto-filled, still editable) */
var RANKS=[['พล.อ.อ.','ACM'],['พล.อ.ท.','AM'],['พล.อ.ต.','AVM'],['น.อ.','GP.CAPT.'],['น.ท.','WG.CDR.'],['น.ต.','SQN.LDR.'],
 ['ร.อ.','FLT.LT.'],['ร.ท.','FLG.OFF.'],['ร.ต.','PLT.OFF.'],['พ.อ.อ.','FS1'],['พ.อ.ท.','FS2'],['พ.อ.ต.','FS3'],['จ.อ.','SGT.'],['จ.ท.','CPL.'],
 ['จ.ต.','LAC'],['พลฯ','AMN.'],['นนอ.','A/CDT.'],['นาย','MR.'],['นาง','MRS.'],['นางสาว','MS.'],['ดร.','DR.']];
function rankEn(th){var t=String(th||'').replace(/\s+/g,'').replace(/หญิง$/,'');
  for(var i=0;i<RANKS.length;i++)if(RANKS[i][0]===t)return RANKS[i][1];return ''}

/* ---------- state ---------- */
var M=null;            // last loaded (= saved) mission from the server
var D=null;            // draft of this device: {info:{k:v}, crew:{front,rear}|null, pax:{id:{base,val}}}
var useSaved=false;    // PREVIEW / PDF / boarding pass read the last SAVE only
var curId=null;
function draftKey(id){return 'pax-a340-draft-'+id}
function loadDraft(id){var d=null;try{d=JSON.parse(localStorage.getItem(draftKey(id))||'null')}catch(e){}
  d=d||{};return {info:d.info||{},crew:d.crew||null,pax:d.pax||{}}}
function persistDraft(){if(!curId||!D)return;try{
  if(!Object.keys(D.info).length&&!D.crew&&!Object.keys(D.pax).length)localStorage.removeItem(draftKey(curId));
  else localStorage.setItem(draftKey(curId),JSON.stringify(D))}catch(e){}}
var EMPTY={rt:'',nt:'',re:'',ne:''};
function normPax(p){p=p||EMPTY;return {rt:String(p.rt||''),nt:String(p.nt||''),re:String(p.re||''),ne:String(p.ne||'')}}
function isEmptyPax(p){p=normPax(p);return !p.rt.trim()&&!p.nt.trim()&&!p.re.trim()&&!p.ne.trim()}
function samePax(a,b){a=normPax(a);b=normPax(b);return a.rt===b.rt&&a.nt===b.nt&&a.re===b.re&&a.ne===b.ne}
function savedInfo(k){return k==='aircraft'?'A340':String((M&&M.info&&M.info[k])||'')}
function getInfo(k){if(!useSaved&&D&&k in D.info)return D.info[k];return savedInfo(k)}
function savedCrew(){return {front:String((M&&M.crew&&M.crew.front)||''),rear:String((M&&M.crew&&M.crew.rear)||'')}}
function getCrew(){return (!useSaved&&D&&D.crew)?D.crew:savedCrew()}
function getPax(id){var p=(!useSaved&&D&&D.pax[id])?D.pax[id].val:(M&&M.pax[id]);return p&&!isEmptyPax(p)?normPax(p):null}
function paxPending(id){return !useSaved&&!!(D&&D.pax[id])}
function status(id){var s=M&&M.status&&M.status[id];return {s:s?s.s|0:0,m:s?s.m|0:0}}
function cleanDraft(){if(!D)return;
  INFO_KEYS.forEach(function(k){if(k in D.info&&D.info[k]===savedInfo(k))delete D.info[k]});
  if(D.crew){var c=savedCrew();if(D.crew.front===c.front&&D.crew.rear===c.rear)D.crew=null}
  Object.keys(D.pax).forEach(function(id){if(!SEAT[id]||samePax(D.pax[id].val,M&&M.pax[id]))delete D.pax[id]});
}
function pending(){if(!D)return {info:[],crew:false,pax:[],n:0};
  var info=INFO_KEYS.filter(function(k){return k in D.info}),pax=SEATS.filter(function(id){return D.pax[id]});
  return {info:info,crew:!!D.crew,pax:pax,n:info.length+(D.crew?1:0)+pax.length}}

/* crew zone: front = row 1 .. chosen row, rear = chosen row .. last row (Mission Commander room is never blocked) */
function crewRows(c){var set={},fi=ROWS.indexOf(c.front),ri=ROWS.indexOf(c.rear),i;
  if(fi>0)for(i=1;i<=fi;i++)set[ROWS[i]]=1;
  if(ri>0)for(i=ri;i<ROWS.length;i++)set[ROWS[i]]=1;
  return set}
function isCrew(id,set){return !!(set||crewRows(getCrew()))[SEAT[id].row]}

/* one category per seat: crew > occupied > unusable > free */
function zoneStats(){var set=crewRows(getCrew()),T={},sum={t:0,crew:0,occ:0,bad:0,free:0};
  ZONES.forEach(function(z){T[z.key]={t:0,crew:0,occ:0,bad:0,free:0}});
  SEATS.forEach(function(id){var z=T[SEAT[id].zone];z.t++;
    if(isCrew(id,set))z.crew++;else if(getPax(id))z.occ++;else if(status(id).s===2)z.bad++;else z.free++});
  ZONES.forEach(function(z){var v=T[z.key];['t','crew','occ','bad','free'].forEach(function(k){sum[k]+=v[k]})});
  T.sum=sum;return T}

/* ---------- time (Thai local time, UTC+7) ---------- */
function p2(n){return String(n).padStart(2,'0')}
function bkk(d){var t=new Date((d?d.getTime():Date.now())+7*3600e3);
  return {y:t.getUTCFullYear(),M:t.getUTCMonth()+1,d:t.getUTCDate(),h:t.getUTCHours(),m:t.getUTCMinutes()}}
function fmtTH(iso){if(!iso)return '';var d=new Date(iso);if(isNaN(d))return String(iso);var b=bkk(d);
  return p2(b.d)+'/'+p2(b.M)+'/'+String(b.y).slice(2)+' '+p2(b.h)+':'+p2(b.m)}
function pdfName(){var b=bkk(),fl=String(getInfo('flight')||'').toUpperCase().replace(/[\\\/:*?"<>|]+/g,'-').trim()||'NO-FLIGHT';
  return String(b.y).slice(2)+p2(b.M)+p2(b.d)+'_'+p2(b.h)+'.'+p2(b.m)+' TH-LT_'+fl+'_Seat Plan A340.pdf'}

/* ---------- toast / ask / warn ---------- */
var toastT=null;
function toast(msg,bad){var t=$('toast');t.textContent=msg;t.className='toast show'+(bad?' bad':'');clearTimeout(toastT);toastT=setTimeout(function(){t.className='toast'},4500)}
var askCb=null;
function ask(title,msg,yes,cb,noCb){$('aTitle').textContent=title;$('aMsg').textContent=msg;$('aYes').textContent=yes;askCb={yes:cb,no:noCb};showDlg($('ask'))}
$('aNo').addEventListener('click',function(){hideDlg($('ask'));var f=askCb;askCb=null;if(f&&f.no)f.no()});
$('aYes').addEventListener('click',function(){hideDlg($('ask'));var f=askCb;askCb=null;if(f&&f.yes)f.yes()});
$('ask').addEventListener('cancel',function(){var f=askCb;askCb=null;if(f&&f.no)f.no()});
var warnCb=null;
function guard(label,fn){
  var n=pending().n;if(!n){fn();return}
  $('wMsg').textContent='มีการแก้ไข '+n+' รายการที่ยังไม่ได้ SAVE ถ้ากด '+label+' ต่อ ข้อมูลที่แสดงจะเป็นข้อมูลก่อนกด SAVE (SAVE ครั้งล่าสุด) ไม่รวมรายการที่แก้ไขไว้';
  $('wGo').textContent=label+' ต่อ (ข้อมูลก่อน SAVE)';warnCb=fn;showDlg($('warn'));
}
$('wNo').addEventListener('click',function(){hideDlg($('warn'));warnCb=null});
$('wGo').addEventListener('click',function(){hideDlg($('warn'));var f=warnCb;warnCb=null;if(f)f()});
$('wSave').addEventListener('click',function(){hideDlg($('warn'));var f=warnCb;warnCb=null;doSave().then(function(ok){if(ok&&f&&!pending().n)f()})});

/* ---------- who ---------- */
var WHO_KEY='pax-a340-who';
function who(){return ($('whoP').value||$('whoM').value||'').trim()}
[].forEach.call(document.querySelectorAll('.whoIn'),function(inp){
  try{inp.value=localStorage.getItem(WHO_KEY)||''}catch(e){}
  inp.addEventListener('input',function(){[].forEach.call(document.querySelectorAll('.whoIn'),function(o){if(o!==inp)o.value=inp.value});
    try{localStorage.setItem(WHO_KEY,inp.value.trim())}catch(e){}});
});

/* ---------- PIN gate ---------- */
var gateCb=null;
function showGate(err,cb){gateCb=cb||gateCb;var g=$('gate');g.hidden=false;$('gateErr').textContent=err||'';$('gateErr').hidden=!err;$('gateBtn').disabled=false;
  $('gatePin').value='';setTimeout(function(){$('gatePin').focus()},50)}
function hideGate(){$('gate').hidden=true}
$('gateBtn').addEventListener('click',function(){var p=$('gatePin').value.trim();if(!p){$('gatePin').focus();return}
  setPin(p);$('gateBtn').disabled=true;var f=gateCb;if(f)f()});
$('gatePin').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('gateBtn').click()}});
function pinFailed(){setPin('');showGate('รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง',route)}

/* =====================================================================
   Mission list page
   ===================================================================== */
var missionsTimer=null;
function showMissions(){
  curId=null;M=null;D=null;
  $('pagePlan').hidden=true;$('pageMissions').hidden=false;document.title='A340 Passenger Seat Plan';
  loadMissions();
}
function loadMissions(){
  return api({action:'missions'}).then(function(res){
    if(res&&res.error==='pin'){pinFailed();return}
    if(!res||!res.ok)throw new Error(res&&res.message||'load');
    hideGate();renderMissions(res.missions||[]);
    var url=res.sheetUrl||CFG.SHEET_URL;if(url){$('sheetLinkM').href=url;$('sheetLinkM').hidden=false}
    $('noticeM').hidden=!DEMO;if(DEMO)$('noticeM').textContent='โหมดทดลอง (demo) ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ได้เชื่อม Google Sheet';
  }).catch(function(){hideGate();$('noticeM').hidden=false;$('noticeM').textContent='ดึงรายการภารกิจจาก Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วกด “โหลดใหม่”'});
}
function renderMissions(list){
  var host=$('mlist');host.textContent='';
  list.forEach(function(m){
    var a=el('a','mcard');a.href='#m='+encodeURIComponent(m.id);
    var top=el('div','top');top.appendChild(el('span','fl',m.flight||'(ยังไม่ระบุเที่ยวบิน)'));top.appendChild(el('span','dt',m.date||''));a.appendChild(top);
    a.appendChild(el('div','nm',m.name||'(ยังไม่ระบุชื่อภารกิจ)'));
    if(m.sector)a.appendChild(el('div','sec',m.sector));
    a.appendChild(el('span','px','ผู้โดยสาร '+(m.pax||0)+' คน'));
    a.appendChild(el('div','meta','แก้ไขล่าสุด '+[m.updated,m.by].filter(Boolean).join(' · ')+' · แท็บ '+m.tab));
    host.appendChild(a);
  });
  $('mempty').hidden=list.length>0;$('mcount').textContent=list.length?'('+list.length+')':'';
}
$('bReloadM').addEventListener('click',function(){loadMissions()});
$('bNew').addEventListener('click',function(){$('nName').value='';$('nFlight').value='';$('nErr').hidden=true;$('nYes').disabled=false;showDlg($('newDlg'));setTimeout(function(){$('nName').focus()},50)});
$('nNo').addEventListener('click',function(){hideDlg($('newDlg'))});
$('nYes').addEventListener('click',function(){
  $('nYes').disabled=true;
  api({action:'create',by:who(),name:$('nName').value.trim(),flight:$('nFlight').value.trim().toUpperCase()}).then(function(res){
    if(res&&res.error==='pin'){hideDlg($('newDlg'));pinFailed();return}
    if(!res||!res.ok)throw new Error(res&&res.message||'create');
    hideDlg($('newDlg'));toast('เปิดภารกิจใหม่แล้ว');location.hash='m='+res.id;
  }).catch(function(e){$('nErr').textContent='เปิดภารกิจไม่สำเร็จ '+(e&&e.message?'('+e.message+')':'')+' ลองอีกครั้ง';$('nErr').hidden=false;$('nYes').disabled=false});
});

/* =====================================================================
   Seat plan page
   ===================================================================== */
function showPlan(id){
  if(curId!==id){curId=id;M=null;datePartial=false;D=loadDraft(id);$('zones').textContent='';$('sync').textContent='กำลังโหลดข้อมูล…';$('adminBox').hidden=true;$('bAdmin').setAttribute('aria-expanded','false')}
  $('pageMissions').hidden=true;$('pagePlan').hidden=false;
  return load();
}
var loading=false,saving=false;
function load(){
  if(loading||!curId)return Promise.resolve();loading=true;var id=curId;
  return api({action:'load',id:id}).then(function(res){
    if(id!==curId)return;
    if(res&&res.error==='pin'){pinFailed();return}
    if(res&&res.error==='no_mission'){toast('ไม่พบภารกิจนี้ (แท็บอาจถูกลบ)',true);location.hash='';return}
    if(!res||!res.ok)throw new Error(res&&res.message||'load');
    hideGate();
    M={id:res.id,tab:res.tab,info:res.info||{},crew:res.crew||{},pax:{},status:res.status||{},statusError:res.statusError||'',history:res.history||[],lastSave:res.lastSave,sheetUrl:res.sheetUrl};
    Object.keys(res.pax||{}).forEach(function(k){if(SEAT[k])M.pax[k]=res.pax[k]});
    cleanDraft();persistDraft();renderAll();
    $('sync').innerHTML='';$('sync').append('ข้อมูลจาก Google Sheet แท็บ “'+M.tab+'” · สภาพที่นั่ง/จอจากไฟล์ Seat Plan 340 (For Admin) · อัปเดตอัตโนมัติทุก 30 วินาที · ล่าสุด ');
    var b=el('b',null,fmtTH(new Date().toISOString()));$('sync').appendChild(b);
  }).catch(function(){$('sync').textContent='ดึงข้อมูลจาก Google Sheet ไม่ได้ จะลองใหม่อัตโนมัติ'})
  .then(function(){loading=false});
}

function renderAll(){if(!M)return;renderTitle();renderInfo();renderPlan();renderSummary();renderManifest();renderHistory();renderAdmin();renderTools();renderNotice()}
function renderNotice(){var n=$('notice'),msgs=[];
  if(DEMO)msgs.push('โหมดทดลอง (demo) ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ได้เชื่อม Google Sheet');
  if(M.statusError)msgs.push('อ่านสภาพที่นั่งจากไฟล์ Seat Plan 340 (For Admin) ไม่ได้ ('+M.statusError+') ผังจึงแสดงทุกที่นั่งเป็นปกติ');
  n.hidden=!msgs.length;n.textContent=msgs.join(' · ')}
function renderTitle(){
  var fl=getInfo('flight'),dt=getInfo('date'),nm=getInfo('name'),sc=getInfo('sector');
  var h=$('planTitle');h.textContent=(fl||'ภารกิจใหม่')+(dt?' · '+dt:'');
  h.appendChild(el('small',null,['SEAT PLAN A340',nm,sc].filter(Boolean).join(' · ')));
  document.title=(fl||'Mission')+' · A340 Seat Plan';
  var url=M.sheetUrl||CFG.SHEET_URL;if(url){$('sheetLink').href=url;$('sheetLink').hidden=false}
}

/* ----- mission info form ----- */
var infoInputs=[].slice.call(document.querySelectorAll('#infoForm input[data-k]'));
(function initDate(){
  var dD=$('dD'),dM=$('dM'),dY=$('dY');
  function ph(sel,t){var o=new Option(t,'');o.disabled=true;o.hidden=true;sel.appendChild(o)}
  ph(dD,'1');for(var i=1;i<=31;i++)dD.appendChild(new Option(String(i),String(i)));
  ph(dM,'OCT');MON.forEach(function(m){dM.appendChild(new Option(m,m))});
  ph(dY,'26');var y=bkk().y%100;for(var j=y-1;j<=y+5;j++)dY.appendChild(new Option(p2(j),p2(j)));
})();
var datePartial=false;
function parseDate(v){var m=/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2})$/.exec(String(v||'').toUpperCase().trim());return m?{d:String(+m[1]),m:m[2],y:m[3]}:null}
function ensureOpt(sel,v){if(!v)return;for(var i=0;i<sel.options.length;i++)if(sel.options[i].value===v)return;sel.appendChild(new Option(v,v))}
function renderDate(){
  var dD=$('dD'),dM=$('dM'),dY=$('dY');
  if(!datePartial){var p=parseDate(getInfo('date'))||{d:'',m:'',y:''};ensureOpt(dY,p.y);dD.value=p.d;dM.value=p.m;dY.value=p.y}
  [dD,dM,dY].forEach(function(s){s.classList.toggle('empty',!s.value)});
  if(D&&'date' in D.info)$('iDate').dataset.pending='1';else delete $('iDate').dataset.pending;
}
['dD','dM','dY'].forEach(function(k){$(k).addEventListener('change',function(){
  var d=$('dD').value,m=$('dM').value,y=$('dY').value;
  if(d&&m&&y){datePartial=false;setInfo('date',d+' '+m+' '+y)}
  else if(!d&&!m&&!y){datePartial=false;setInfo('date','')}
  else{datePartial=true;renderDate()}
})});
function renderInfo(){
  infoInputs.forEach(function(inp){var k=inp.dataset.k;
    if(document.activeElement!==inp)inp.value=getInfo(k);
    if(D&&k in D.info)inp.dataset.pending='1';else delete inp.dataset.pending});
  renderDate();
}
function setInfo(k,v){
  if(UPPER[k])v=v.toUpperCase();
  D.info[k]=v;cleanDraft();persistDraft();renderInfo();renderTitle();renderTools();
}
infoInputs.forEach(function(inp){
  inp.addEventListener('input',function(){setInfo(inp.dataset.k,inp.value)});
  inp.addEventListener('blur',function(){var k=inp.dataset.k,v=inp.value.trim();
    if(k==='time'){var m=/^(\d{1,2})[:.\s]?(\d{2})$/.exec(v);if(m&&+m[1]<24&&+m[2]<60)v=p2(+m[1])+':'+m[2]}
    if(k==='sector')v=v.toUpperCase().replace(/\s*[-–—\/>]+\s*/g,'-').replace(/\s+/g,'-');
    if(v!==inp.value)inp.value=v;setInfo(k,v)});
});

/* ----- cabin ----- */
function seatName(p){if(!p)return '';var th=[p.rt,p.nt].filter(Boolean).join(' '),en=[p.re,p.ne].filter(Boolean).join(' ');return th||en}
function seatBtn(id,text,mon,ctx){
  var b=el('button','seat');b.type='button';b.dataset.id=id;
  if(mon)b.appendChild(el('span','m'));
  var s=el('span','s');s.appendChild(el('span','lt',text));b.appendChild(s);
  var st=status(id),p=getPax(id),crew=isCrew(id,ctx.crew);
  b.dataset.s=st.s;if(mon)b.dataset.m=st.m;
  if(p){b.classList.add('occ');if(ctx.report){var nm=el('span','nm',[p.rt,p.nt].filter(Boolean).join(' ')||[p.re,p.ne].filter(Boolean).join(' '));s.appendChild(nm)}}
  if(crew)b.classList.add('crew');
  if(paxPending(id)&&!ctx.report)b.dataset.pending='1';
  var label=(id==='CC'?'Mission Commander':'ที่นั่ง '+id)+(crew?' · CREW ZONE':'')+(st.s===2?' · ที่นั่งใช้ไม่ได้':st.s===1?' · ที่นั่งขัดข้องแต่ใช้ได้':'')+
    (mon?(st.m===2?' · จอเสีย':st.m===1?' · จอเสื่อม':''):'')+(p?' · '+seatName(p)+(p.ne?' / '+[p.re,p.ne].filter(Boolean).join(' '):''):' · ว่าง')+(paxPending(id)?' · ยังไม่ SAVE':'');
  b.title=label;b.setAttribute('aria-label',label);
  if(ctx.report)b.tabIndex=-1;
  return b;
}
function buildZones(host,report){
  host.textContent='';var crew=crewRows(getCrew()),stats=zoneStats(),ctx={crew:crew,report:report};
  ZONES.forEach(function(z){
    var sec=el('section','zone'),h=el('header'),v=stats[z.key];
    h.appendChild(el('h2',null,z.title));
    var bd=el('span','badge'+(v.free?'':' zero'));bd.append('ว่าง ');bd.appendChild(el('b',null,String(v.free)));bd.append(' / '+v.t);
    bd.title='ที่นั่งว่างสำหรับผู้โดยสาร '+v.free+' จากทั้งหมด '+v.t+' ที่นั่ง';h.appendChild(bd);sec.appendChild(h);
    var box=el('div','rows'),cbox=null;
    function put(row,key){
      if(crew[key]){if(!cbox){cbox=el('div','crewbox');cbox.appendChild(el('div','crewlbl','CREW ZONE'));box.appendChild(cbox)}cbox.appendChild(row)}
      else{cbox=null;box.appendChild(row)}
    }
    z.items.forEach(function(it){
      if(it.cc){
        var r=el('div','row');r.appendChild(el('div','rowno'));
        ['A','','EF','','K'].forEach(function(grp,gi){
          if(gi)r.appendChild(el('div','aisle'));if(grp==='')return;var g=el('div','grp');
          if(gi===0){g.appendChild(seatBtn('CC','CC',true,ctx));g.appendChild(el('span','cclabel room','Mission Commander'))}
          else grp.split('').forEach(function(){g.appendChild(el('div','gap'))});
          r.appendChild(g)});
        put(r,'CC');return;
      }
      if(it.ovh){
        var o=el('div','row ovhrow');o.appendChild(el('div','rowno'));
        ['L','C','R'].forEach(function(p,i){
          var id='MON-'+it.ovh+'-'+p,st=status(id);if(i)o.appendChild(el('div','aisle'));
          var g=el('div','grp');it.g[i].split('').forEach(function(){g.appendChild(el('div','gap'))});
          var b=el('span','ovh','Monitor');b.dataset.m=st.m;b.title='Monitor เพดาน หน้าแถว '+it.ovh+' ('+['ซ้าย','กลาง','ขวา'][i]+') · '+['จอปกติ','จอเสื่อม','จอเสีย'][st.m];
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
function renderPlan(){buildZones($('zones'),false)}
$('zones').addEventListener('click',function(e){var b=e.target.closest('.seat[data-id]');if(b)openSeat(b.dataset.id)});

function summaryHTML(){
  var S=zoneStats(),h='<thead><tr><th>ZONE</th><th>ที่นั่งรวม</th><th>CREW ZONE</th><th>ที่นั่งใช้ไม่ได้</th><th>มีผู้โดยสาร</th><th class="sep">ว่าง (กรอกได้)</th></tr></thead><tbody>';
  function row(name,v){return '<tr><td>'+name+'</td><td class="n">'+v.t+'</td><td class="n c'+(v.crew?' nz':'')+'">'+v.crew+'</td><td class="n b'+(v.bad?' nz':'')+'">'+v.bad+'</td><td class="n">'+v.occ+'</td><td class="n free sep">'+v.free+'</td></tr>'}
  ZONES.forEach(function(z){h+=row(z.name,S[z.key])});
  return h+row('รวม',S.sum)+'</tbody>';
}
function renderSummary(){$('summary').innerHTML=summaryHTML()}

/* ----- manifest ----- */
function manifestRows(){var set=crewRows(getCrew());return SEATS.filter(function(id){return getPax(id)}).map(function(id){
  var p=getPax(id),st=status(id);return {id:id,p:p,zone:zoneOf(SEAT[id].zone).name,crew:isCrew(id,set),bad:st.s===2,pend:paxPending(id)}})}
function manifestHead(){return '<thead><tr><th>ที่นั่ง</th><th>โซน</th><th>ยศ / ชื่อ-สกุล (ไทย)</th><th>RANK / NAME (EN)</th><th></th></tr></thead>'}
function manifestRow(r,report){var tr=el('tr');tr.dataset.id=r.id;
  tr.appendChild(el('td',null,r.id));tr.appendChild(el('td',null,r.zone));
  tr.appendChild(el('td',null,[r.p.rt,r.p.nt].filter(Boolean).join(' ')));tr.appendChild(el('td','en',[r.p.re,r.p.ne].filter(Boolean).join(' ')));
  var t=el('td');
  if(r.crew)t.appendChild(el('span','tag c','อยู่ใน CREW ZONE'));
  if(r.bad)t.appendChild(el('span','tag b','ที่นั่งใช้ไม่ได้'));
  if(r.pend&&!report)t.appendChild(el('span','tag p','ยังไม่ SAVE'));
  tr.appendChild(t);return tr}
function renderManifest(){
  var list=manifestRows(),t=$('manifest');t.innerHTML=manifestHead();var tb=el('tbody');
  list.forEach(function(r){tb.appendChild(manifestRow(r,false))});t.appendChild(tb);
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
  var n=pending().n;
  $('pend').textContent=n?('แก้ไขแล้ว '+n+' รายการ ยังไม่ได้ SAVE'):'ไม่มีการแก้ไขค้าง';$('pend').classList.toggle('on',n>0);
  if(!saving){$('bSave').textContent=n?'SAVE ('+n+')':'SAVE';$('bSave').disabled=!n}
  var ls=M&&M.lastSave;$('lastSave').textContent=ls&&ls.at?('SAVE ล่าสุด: '+[ls.by,fmtTH(ls.at)].filter(Boolean).join(' · ')):'ยังไม่เคย SAVE';
}

/* ----- passenger dialog ----- */
(function(){var dl=$('rankList');RANKS.forEach(function(r){var o=document.createElement('option');o.value=r[0];o.label=r[1];dl.appendChild(o)})})();
var cur=null,autoRe='',dupOk=false;
function openSeat(id){
  if(!SEAT[id]||!M)return;cur=id;dupOk=false;
  var p=getPax(id)||EMPTY,st=status(id),crew=isCrew(id),z=zoneOf(SEAT[id].zone);
  $('dTitle').textContent=(id==='CC'?'Mission Commander':'ที่นั่ง '+id)+' · '+z.title;
  var sv=M.pax[id];
  $('dSub').textContent=(paxPending(id)?'มีการแก้ไขที่ยังไม่ SAVE · ':'')+(sv&&sv.at?'บันทึกล่าสุด '+[sv.by,sv.at].filter(Boolean).join(' · '):'ยังไม่มีการบันทึกที่นั่งนี้');
  var canEdit=!crew&&st.s!==2,note=$('dState');
  note.hidden=!(crew||st.s);note.className='dnote'+(canEdit?'':' bad');
  note.textContent=crew?'ที่นั่งนี้อยู่ใน CREW ZONE กันไว้ให้ลูกเรือ ผู้โดยสารกรอกไม่ได้':st.s===2?'ที่นั่งนี้ใช้งานไม่ได้ (ตามไฟล์ Seat Plan 340 For Admin) กรอกผู้โดยสารไม่ได้':'ที่นั่งนี้มีข้อขัดข้องแต่ยังใช้ได้ (ตามไฟล์ Seat Plan 340 For Admin)';
  $('pRt').value=p.rt;$('pNt').value=p.nt;$('pRe').value=p.re;$('pNe').value=p.ne;autoRe=rankEn(p.rt)===p.re?p.re:'';
  ['pRt','pNt','pRe','pNe'].forEach(function(k){$(k).disabled=!canEdit});
  $('dOk').hidden=!canEdit;$('dCancel').textContent=canEdit?'ยกเลิก':'ปิด';
  $('dClearSeat').hidden=!getPax(id);$('dErr').hidden=true;
  showDlg($('dlg'));if(canEdit)setTimeout(function(){$('pRt').focus()},50);
}
$('pRt').addEventListener('input',function(){var en=rankEn($('pRt').value),re=$('pRe').value.trim();
  if(en&&(!re||re===autoRe)){$('pRe').value=en;autoRe=en}});
$('pNe').addEventListener('blur',function(){$('pNe').value=$('pNe').value.toUpperCase()});
$('pRe').addEventListener('blur',function(){$('pRe').value=$('pRe').value.toUpperCase()});
$('dCancel').addEventListener('click',function(){hideDlg($('dlg'));cur=null});
function setPax(id,val){
  if(!D.pax[id])D.pax[id]={base:normPax(M.pax[id]),val:null};
  D.pax[id].val=normPax(val);cleanDraft();persistDraft();
}
function afterPaxEdit(){renderPlan();renderSummary();renderManifest();renderTools()}
$('dOk').addEventListener('click',function(){
  if(!cur)return;var id=cur;
  var v={rt:$('pRt').value.trim().replace(/\s+/g,''),nt:$('pNt').value.trim().replace(/\s{3,}/g,'  '),re:$('pRe').value.trim().toUpperCase().replace(/\s+/g,''),ne:$('pNe').value.trim().toUpperCase().replace(/\s{3,}/g,'  ')};
  if(!isEmptyPax(v)&&!v.nt&&!v.ne){$('dErr').textContent='กรุณากรอกชื่อ-สกุล ภาษาไทย หรือ ภาษาอังกฤษ อย่างน้อย 1 ช่อง';$('dErr').hidden=false;return}
  if(!dupOk&&!isEmptyPax(v)){
    var key=function(s){return String(s||'').replace(/\s+/g,' ').trim().toUpperCase()};
    var dup=SEATS.filter(function(o){if(o===id)return false;var q=getPax(o);return q&&((v.nt&&key(q.nt)===key(v.nt))||(v.ne&&key(q.ne)===key(v.ne)))});
    if(dup.length){$('dErr').textContent='ชื่อนี้มีอยู่แล้วที่ที่นั่ง '+dup.join(', ')+' ถ้าต้องการบันทึกซ้ำ กดตกลงอีกครั้ง';$('dErr').hidden=false;dupOk=true;return}
  }
  setPax(id,v);hideDlg($('dlg'));cur=null;afterPaxEdit();
});
$('dClearSeat').addEventListener('click',function(){if(!cur)return;setPax(cur,EMPTY);hideDlg($('dlg'));toast('ล้างที่นั่ง '+cur+' แล้ว กด SAVE เพื่อบันทึก');cur=null;afterPaxEdit()});
[$('pRt'),$('pNt'),$('pRe'),$('pNe')].forEach(function(i){i.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();$('dOk').click()}})});

/* ----- CLEAR ----- */
$('bClear').addEventListener('click',function(){
  var occ=SEATS.filter(function(id){return getPax(id)}).length;
  ask('CLEAR ลบข้อมูลทั้งหมด','ลบรายชื่อผู้โดยสารทุกที่นั่ง ('+occ+' คน) และข้อมูลภารกิจทุกช่อง (ยกเว้นประเภทเครื่องบิน A340 และ CREW ZONE) การลบจะบันทึกลง Google Sheet เมื่อกด SAVE ประวัติเดิมยังอยู่','CLEAR',function(){
    INFO_KEYS.forEach(function(k){D.info[k]=''});datePartial=false;
    SEATS.forEach(function(id){if(getPax(id)||D.pax[id])setPax(id,EMPTY)});
    cleanDraft();persistDraft();renderAll();toast('ล้างข้อมูลแล้ว กด SAVE เพื่อบันทึก');
  });
});

/* ----- SAVE ----- */
function doSave(){
  if(saving||!M)return Promise.resolve(false);
  var pd=pending();if(!pd.n){toast('ไม่มีรายการที่ต้อง SAVE');return Promise.resolve(true)}
  var body={action:'save',id:curId,by:who()||'หน้าเว็บ',info:{},pax:[]};
  pd.info.forEach(function(k){body.info[k]=D.info[k]});
  if(pd.crew)body.crew=D.crew;
  pd.pax.forEach(function(id){body.pax.push({id:id,base:D.pax[id].base,val:D.pax[id].val})});
  saving=true;$('bSave').disabled=true;$('bSave').textContent='กำลัง SAVE…';
  var sent=JSON.parse(JSON.stringify(D));
  return api(body).then(function(res){
    if(res&&res.error==='pin'){saving=false;pinFailed();return false}
    if(!res||!res.ok){toast('SAVE ไม่สำเร็จ'+(res&&res.message?' ('+res.message+')':'')+' ลองกด SAVE อีกครั้ง',true);return false}
    var conf={};(res.conflicts||[]).forEach(function(c){conf[c.id]=c});
    /* drop what was sent (unless edited again meanwhile); conflicting seats take the newer server value */
    pd.info.forEach(function(k){if(D.info[k]===sent.info[k])delete D.info[k]});
    if(pd.crew&&D.crew&&sent.crew&&D.crew.front===sent.crew.front&&D.crew.rear===sent.crew.rear)D.crew=null;
    pd.pax.forEach(function(id){if(D.pax[id]&&samePax(D.pax[id].val,sent.pax[id].val))delete D.pax[id]});
    persistDraft();
    var cids=Object.keys(conf);
    if(cids.length)ask('มีผู้อื่นบันทึกที่นั่งเดียวกันก่อน','ที่นั่ง '+cids.join(', ')+' ถูกแก้ไขจากเครื่องอื่นก่อนที่คุณจะกด SAVE ระบบจึงไม่บันทึกทับ และแสดงข้อมูลล่าสุดแทน ตรวจสอบแล้วแก้ไขใหม่ได้','รับทราบ',null);
    else toast('SAVE ลง Google Sheet เรียบร้อย '+(res.saved||0)+' รายการ');
    return true;
  },function(){toast('ติดต่อ Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วกด SAVE อีกครั้ง',true);return false})
  .then(function(ok){saving=false;renderTools();if(ok)return load().then(function(){return ok});return ok});
}
$('bSave').addEventListener('click',function(){doSave()});

/* ----- PREVIEW / PDF ----- */
function infoCell(label,val,wide){var d=el('div',wide?'wide':null);d.appendChild(el('small',null,label));d.appendChild(el('b',null,val||'-'));return d}
function reportNode(isPreview){
  var r=el('div','report'),h=el('div','blk');
  h.appendChild(el('h1',null,'SEAT PLAN A340 · ผังที่นั่งผู้โดยสาร'));
  var g=el('div','rinfo');
  g.appendChild(infoCell('AIRCRAFT','A340'));g.appendChild(infoCell('MISSION / ภารกิจ',getInfo('name'),true));g.appendChild(infoCell('FLIGHT',getInfo('flight')));
  g.appendChild(infoCell('SECTOR',getInfo('sector')));g.appendChild(infoCell('DATE',getInfo('date')));g.appendChild(infoCell('GATE',getInfo('gate')));g.appendChild(infoCell('BOARDING TIME',getInfo('time')));
  h.appendChild(g);
  var meta=el('div','rmeta');var b=bkk();
  meta.appendChild(el('span',null,'ออกรายงาน '+p2(b.d)+'/'+p2(b.M)+'/'+String(b.y).slice(2)+' '+p2(b.h)+':'+p2(b.m)+' (TH-LT)'));
  var ls=M.lastSave;meta.appendChild(el('span',null,ls&&ls.at?'SAVE ล่าสุด '+[ls.by,fmtTH(ls.at)].filter(Boolean).join(' · '):'ยังไม่เคย SAVE'));
  meta.appendChild(el('span',null,'สภาพที่นั่ง/จอ ตามไฟล์ Seat Plan 340 (For Admin)'));
  h.appendChild(meta);
  var np=pending().n;if(isPreview&&np)h.appendChild(el('div','rwarn','ตัวอย่างนี้เป็นข้อมูล SAVE ล่าสุด ยังไม่รวมการแก้ไข '+np+' รายการที่ยังไม่ได้ SAVE'));
  h.appendChild(el('h2',null,'ที่นั่งว่างตามโซน'));
  var t=el('table');t.innerHTML=summaryHTML();h.appendChild(t);
  var lg=$('legend').cloneNode(true);lg.removeAttribute('id');h.appendChild(lg);
  r.appendChild(h);
  var tmp=el('div');buildZones(tmp,true);
  [].slice.call(tmp.children).forEach(function(z){z.classList.add('blk');z.setAttribute('inert','');r.appendChild(z)});
  var list=manifestRows(),CH=32;
  if(!list.length){var e=el('div','blk');e.appendChild(el('h2',null,'รายชื่อผู้โดยสาร'));e.appendChild(el('p','rsub','ยังไม่มีรายชื่อ'));r.appendChild(e)}
  for(var i=0;i<list.length;i+=CH){
    var blk=el('div','blk');blk.appendChild(el('h2',null,'รายชื่อผู้โดยสาร ('+list.length+' คน)'+(i?' ต่อ':'')));
    var mt=el('table','manifest');mt.innerHTML=manifestHead();var tb=el('tbody');
    list.slice(i,i+CH).forEach(function(rw){tb.appendChild(manifestRow(rw,true))});mt.appendChild(tb);blk.appendChild(mt);r.appendChild(blk);
  }
  return r;
}
function openPreview(){useSaved=true;var node;try{node=reportNode(true)}finally{useSaved=false}
  var host=$('pvBody');host.textContent='';host.appendChild(node);showDlg($('pv'))}
$('bPreview').addEventListener('click',function(){if(M)guard('PREVIEW',openPreview)});
$('pvClose').addEventListener('click',function(){hideDlg($('pv'))});
$('pvPdf').addEventListener('click',function(){exportPdf()});
$('bPdf').addEventListener('click',function(){if(M)guard('EXPORT TO PDF',exportPdf)});

var libs={};
function loadLib(src){if(!libs[src])libs[src]=new Promise(function(ok,no){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=function(){delete libs[src];no(new Error('load'))};document.head.appendChild(s)});return libs[src]}
function offerFile(name,data,mime){
  var c=window.claude,p=(c&&c.use)?Promise.resolve(c.use('downloads')).catch(function(){return null}):Promise.resolve(null);
  return p.then(function(d){
    if(d)return d.save({filename:name,data:data}).then(function(){toast('ส่งไฟล์ '+name+' แล้ว')},function(e){
      if(e&&e.code==='declined')return;toast('บันทึกไฟล์ไม่สำเร็จในหน้านี้',true)});
    var url=URL.createObjectURL(new Blob([data],{type:mime})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},4000);
    toast('ดาวน์โหลด '+name);
  });
}
var busy=false;
function exportPdf(){
  if(busy||!M)return;busy=true;toast('กำลังสร้าง PDF…'+(pending().n?' (ข้อมูลก่อน SAVE)':''));
  var name;useSaved=true;var wrap=el('div','offscreen'),node;try{node=reportNode(false);name=pdfName()}finally{useSaved=false}
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
    return offerFile(name,pdf.output('arraybuffer'),'application/pdf');
  })
  .catch(function(){toast('สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง',true)})
  .then(function(){wrap.remove();busy=false});
}

/* ----- ADMIN: crew zone ----- */
(function(){var f=$('crewFront'),r=$('crewRear');
  f.appendChild(new Option('ไม่กั้น',''));r.appendChild(new Option('ไม่กั้น',''));
  ROWS.forEach(function(k,i){if(!i)return;f.appendChild(new Option('แถว '+k+'  ('+zoneOf(SEAT[SEATS.filter(function(s){return SEAT[s].row===k})[0]].zone).title+')',k))});
  ROWS.slice().reverse().forEach(function(k){if(k==='CC')return;r.appendChild(new Option('แถว '+k+'  ('+zoneOf(SEAT[SEATS.filter(function(s){return SEAT[s].row===k})[0]].zone).title+')',k))});
})();
function renderAdmin(){var c=getCrew();$('crewFront').value=c.front;$('crewRear').value=c.rear;
  [['crewFront',D&&D.crew&&D.crew.front!==savedCrew().front],['crewRear',D&&D.crew&&D.crew.rear!==savedCrew().rear]].forEach(function(x){
    if(x[1])$(x[0]).dataset.pending='1';else delete $(x[0]).dataset.pending});
  $('bAdmin').textContent=(c.front||c.rear)?'ADMIN · CREW ZONE '+[c.front?'หัว→'+c.front:'',c.rear?c.rear+'→ท้าย':''].filter(Boolean).join(' · '):'ADMIN'}
$('bAdmin').addEventListener('click',function(){var b=$('adminBox');b.hidden=!b.hidden;$('bAdmin').setAttribute('aria-expanded',String(!b.hidden));if(!b.hidden)b.scrollIntoView({behavior:'smooth',block:'start'})});
function changeCrew(){
  var nc={front:$('crewFront').value,rear:$('crewRear').value};
  var fi=ROWS.indexOf(nc.front),ri=ROWS.indexOf(nc.rear);
  if(fi>0&&ri>0&&fi>=ri){toast('กั้นจากหัวเครื่องและท้ายเครื่องซ้อนกัน เลือกแถวใหม่',true);renderAdmin();return}
  var set=crewRows(nc),hit=SEATS.filter(function(id){return set[SEAT[id].row]&&getPax(id)});
  function apply(){D.crew=nc;hit.forEach(function(id){setPax(id,EMPTY)});cleanDraft();persistDraft();renderAll();
    toast('ตั้ง CREW ZONE แล้ว กด SAVE เพื่อบันทึก')}
  if(hit.length)ask('มีผู้โดยสารในแถวที่จะกั้น','ที่นั่ง '+hit.join(', ')+' มีรายชื่อผู้โดยสารอยู่ ถ้ากั้นเป็น CREW ZONE รายชื่อในที่นั่งเหล่านี้จะถูกล้างออก','กั้นและล้างรายชื่อ',apply,renderAdmin);
  else apply();
}
$('crewFront').addEventListener('change',changeCrew);$('crewRear').addEventListener('change',changeCrew);

/* ----- PRINT BOARDING PASS ----- */
var bpList=[];
function openBp(){
  if(!M)return;
  useSaved=true;try{
    var info={};['flight','sector','date','gate','time','note'].forEach(function(k){info[k]=getInfo(k)});
    bpList=SEATS.filter(function(id){return getPax(id)}).map(function(id){var p=getPax(id);p.seat=id;
      return {id:id,label:seatName(p)||p.ne,d:window.BoardingPass.data(p,info,zoneOf(SEAT[id].zone).name)}});
  }finally{useSaved=false}
  var host=$('bpList');host.textContent='';
  bpList.forEach(function(it){var l=el('label','chk'),c=el('input');c.type='checkbox';c.checked=true;c.value=it.id;
    l.appendChild(c);l.appendChild(el('span','sid',it.id));l.appendChild(el('span','nmx',it.label));host.appendChild(l)});
  if(!bpList.length)host.appendChild(el('p','empty','ยังไม่มีผู้โดยสารที่ SAVE แล้ว'));
  showDlg($('bpDlg'));bpRender();
}
function bpSelected(){var on={};[].forEach.call($('bpList').querySelectorAll('input:checked'),function(c){on[c.value]=1});return bpList.filter(function(it){return on[it.id]})}
function bpRender(){
  var sel=bpSelected(),paper=$('bpPaper').value;
  $('bpAll').checked=sel.length===bpList.length&&sel.length>0;$('bpAll').indeterminate=sel.length>0&&sel.length<bpList.length;
  var sheets=paper==='card'?sel.length:Math.ceil(sel.length/3);
  $('bpCount').textContent=sel.length+' ใบ · '+sheets+' แผ่น';$('bpPrint').disabled=!sel.length;
  var pv=$('bpPv');
  if(!sel.length){pv.textContent='';pv.appendChild(el('p','empty','เลือกผู้โดยสารอย่างน้อย 1 คน'));return}
  var res=window.BoardingPass.preview(pv,sel.map(function(it){return it.d}),paper,2);
  if(res.shown<sel.length)pv.appendChild(el('p','empty','ตัวอย่างแสดง '+res.shown+' จาก '+sel.length+' ใบ'));
}
$('bpList').addEventListener('change',bpRender);
$('bpAll').addEventListener('change',function(){var v=$('bpAll').checked;[].forEach.call($('bpList').querySelectorAll('input'),function(c){c.checked=v});bpRender()});
$('bpPaper').addEventListener('change',bpRender);
$('bpClose').addEventListener('click',function(){hideDlg($('bpDlg'))});
$('bpPrint').addEventListener('click',function(){var sel=bpSelected();if(!sel.length)return;
  toast('กำลังเตรียมพิมพ์ '+sel.length+' ใบ…');window.BoardingPass.print(sel.map(function(it){return it.d}),$('bpPaper').value)});
function bpGuard(){if(M)guard('PRINT BOARDING PASS',openBp)}
$('bBp').addEventListener('click',bpGuard);$('bBp2').addEventListener('click',bpGuard);
window.addEventListener('resize',function(){if($('bpDlg').open)bpRender()});

/* =====================================================================
   routing + start
   ===================================================================== */
function route(){
  if(!API&&!DEMO){
    $('pageMissions').hidden=false;$('pagePlan').hidden=true;hideGate();
    var n=$('noticeM');n.hidden=false;n.textContent='ยังไม่ได้ตั้งค่า API_URL ใน config.js หน้านี้จึงยังไม่เชื่อมกับ Google Sheet (ดู README) · ทดลองใช้งานได้ที่ ';
    var a=el('a',null,'โหมดทดลอง');a.href='?demo=1';n.appendChild(a);return;
  }
  if(!getPin()){showGate('',route);return}
  var m=/^#m=([^&]+)/.exec(location.hash);
  if(m)showPlan(decodeURIComponent(m[1]));else showMissions();
}
$('backLink').addEventListener('click',function(e){e.preventDefault();location.hash=''});
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',function(e){if(pending().n){e.preventDefault();e.returnValue=''}});
setInterval(function(){
  if(document.hidden||saving||!$('gate').hidden||anyDialogOpen())return;
  if(curId&&!$('pagePlan').hidden)load();else if(!$('pageMissions').hidden&&(API||DEMO)&&getPin())loadMissions();
},30000);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&curId&&!saving&&$('gate').hidden&&!anyDialogOpen())load()});

function start(){route()}
if(DEMO){var s=document.createElement('script');s.src='demo.js';s.onload=start;s.onerror=function(){toast('โหลดโหมดทดลองไม่ได้',true)};document.head.appendChild(s)}
else start();
})();
