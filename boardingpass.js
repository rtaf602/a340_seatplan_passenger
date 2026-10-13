/* Boarding pass: builds the 203 × 82.5 mm pass (design from rtaf-boarding-pass.html) and prints it
 * either 3 per A4 sheet with cut marks, or one per card-size page. Exposes window.BoardingPass. */
(function(){
'use strict';
var MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
var CITY={DMK:'Bangkok Don Mueang',BKK:'Bangkok Suvarnabhumi',CNX:'Chiang Mai',CEI:'Chiang Rai',HKT:'Phuket',UTP:'U-Tapao',NNT:'Nan',
  KBV:'Krabi',HDY:'Hat Yai',USM:'Koh Samui',UTH:'Udon Thani',KKC:'Khon Kaen',UBP:'Ubon Ratchathani',NST:'Nakhon Si Thammarat',URT:'Surat Thani',
  PHS:'Phitsanulok',NAK:'Nakhon Ratchasima',KOP:'Nakhon Phanom',SNO:'Sakon Nakhon',LPT:'Lampang',PRH:'Phrae',MAQ:'Mae Sot',TST:'Trang',NAW:'Narathiwat',
  NAN:'Nadi',SUV:'Suva',SIN:'Singapore',KUL:'Kuala Lumpur',CGK:'Jakarta',DPS:'Denpasar Bali',MNL:'Manila',SGN:'Ho Chi Minh City',HAN:'Hanoi',DAD:'Da Nang',
  VTE:'Vientiane',LPQ:'Luang Prabang',PNH:'Phnom Penh',REP:'Siem Reap',RGN:'Yangon',NPT:'Nay Pyi Taw',BWN:'Bandar Seri Begawan',
  NRT:'Tokyo Narita',HND:'Tokyo Haneda',KIX:'Osaka Kansai',ICN:'Seoul Incheon',GMP:'Seoul Gimpo',PEK:'Beijing Capital',PKX:'Beijing Daxing',
  PVG:'Shanghai Pudong',CAN:'Guangzhou',KMG:'Kunming',HKG:'Hong Kong',MFM:'Macau',TPE:'Taipei',DEL:'Delhi',BOM:'Mumbai',CMB:'Colombo',KTM:'Kathmandu',
  DAC:'Dhaka',MLE:'Male',DXB:'Dubai',AUH:'Abu Dhabi',DOH:'Doha',RUH:'Riyadh',JED:'Jeddah',IST:'Istanbul',SYD:'Sydney',MEL:'Melbourne',BNE:'Brisbane',
  PER:'Perth',CBR:'Canberra',AKL:'Auckland',WLG:'Wellington',POM:'Port Moresby',LHR:'London Heathrow',CDG:'Paris Charles de Gaulle',FRA:'Frankfurt',
  MUC:'Munich',BER:'Berlin',AMS:'Amsterdam',BRU:'Brussels',ZRH:'Zurich',VIE:'Vienna',FCO:'Rome',MAD:'Madrid',CPH:'Copenhagen',ARN:'Stockholm',
  HEL:'Helsinki',OSL:'Oslo',SVO:'Moscow',JFK:'New York JFK',IAD:'Washington Dulles',LAX:'Los Angeles',SFO:'San Francisco',HNL:'Honolulu',GUM:'Guam'};
var EMB='emblem.png';
function abs(u){try{return new URL(u,location.href).href}catch(e){return u}}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

/* "1 OCT 26" -> "01 OCT 2026" */
function longDate(v){var m=/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})$/.exec(String(v||'').trim().toUpperCase());
  if(!m)return String(v||'').toUpperCase();var y=m[3].length===2?'20'+m[3]:m[3];return ('0'+m[1]).slice(-2)+' '+m[2]+' '+y}
function route(sector){var p=String(sector||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  var f=p[0]||'',t=p.length>1?p[p.length-1]:'';
  return {fromCode:f,toCode:t,fromCity:CITY[f]||'',toCity:CITY[t]||''}}

/* passenger + mission -> fields shown on the pass */
function data(p,info,zoneName){
  var th=[p.rt,p.nt].filter(function(x){return String(x||'').trim()}).join(' ');
  var en=String(p.ne||'').toUpperCase(),rk=String(p.re||'').toUpperCase();
  var r=route(info.sector);
  return {
    hasEn:!!en,hasTh:!!th,hasRk:!!en&&!!rk,
    rankAbbr:rk,enFull:en,thFull:th,stubName:en||th,
    fromCode:r.fromCode,toCode:r.toCode,fromCity:r.fromCity,toCity:r.toCity,
    aircraft:'A340',flight:String(info.flight||'').toUpperCase(),date:longDate(info.date),
    classEn:String(zoneName||'').toUpperCase(),gate:String(info.gate||'').toUpperCase(),time:String(info.time||''),
    seat:String(p.seat||'').toUpperCase(),noteTh:String(info.note||'')
  };
}

function rng(str){var h=1779033703;for(var i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19}
  return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return((h^=h>>>16)>>>0)/4294967296}}
function bars(seed){var r=rng(seed),H=140,y=0,s='';
  while(y<H){var h=[.6,.6,1.2,1.8,2.4][Math.floor(r()*5)];if(y+h>H)break;s+='<rect x="0" y="'+y.toFixed(2)+'" width="10" height="'+h+'"/>';y+=h+[.6,.6,1.2,1.8][Math.floor(r()*4)]}
  return '<svg class="bars" viewBox="0 0 10 '+H+'" preserveAspectRatio="none"><g fill="#d6b25e">'+s+'</g></svg>'}
function qr(seed){var r=rng(seed+'q'),N=25,s='';
  function finder(x,y){return x<7&&y<7||x>=N-7&&y<7||x<7&&y>=N-7}
  function zone(x,y){return x<8&&y<8||x>=N-8&&y<8||x<8&&y>=N-8}
  for(var y=0;y<N;y++)for(var x=0;x<N;x++){var on;
    if(finder(x,y)){var fx=x<7?x:x-(N-7),fy=y<7?y:y-(N-7);on=fx==0||fx==6||fy==0||fy==6||(fx>=2&&fx<=4&&fy>=2&&fy<=4)}
    else if(zone(x,y))on=false;else on=r()<.48;
    if(on)s+='<rect x="'+x+'" y="'+y+'" width="1.02" height="1.02"/>'}
  return '<svg class="qr" viewBox="0 0 '+N+' '+N+'"><g fill="#d6b25e">'+s+'</g></svg>'}

var PLANE='<svg class="fly" viewBox="0 0 64 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M0 8h22M42 8h22" stroke-dasharray="2 2.5"/><path d="M26 8l5-1.2 4-5h1.6l-2 5.2 4-.5 1.4-1.8h1.2L40.4 8l.8 3.3H40l-1.4-1.8-4-.5 2 5.2H35l-4-5L26 8z" fill="currentColor" stroke="none"/></svg>';
var ARROW='<svg viewBox="0 0 28 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M0 6h25M20 1.5L25.5 6 20 10.5"/></svg>';

function passHTML(d){
  var e=esc,img='<img class="emb" alt="" src="'+e(abs(EMB))+'">';
  var solo=d.hasEn!==d.hasTh&&!d.hasRk;
  var seed=[d.enFull||d.thFull,d.flight,d.seat,d.date].join('|');
  return '<div class="bpx">'+
   '<section class="main"><div class="body">'+
    '<div class="head">'+img+'<div class="org"><div class="en">ROYAL THAI AIR FORCE</div><div class="tx">กองทัพอากาศ</div></div><div class="title"><div class="en">BOARDING PASS</div></div></div>'+
    '<div class="mid"><div class="pax'+(solo?' solo':'')+'"><div class="lab">Passenger</div>'+
      '<div class="rkl"'+(d.hasRk?'':' hidden')+'>'+e(d.rankAbbr)+'</div>'+
      '<div class="name" data-fit="'+(d.hasTh?13:15)+'"'+(d.hasEn?'':' hidden')+'>'+e(d.enFull)+'</div>'+
      '<div class="psub" data-fit="'+(d.hasEn?9.5:14)+'"'+(d.hasTh?'':' hidden')+'>'+e(d.thFull)+'</div></div>'+
     '<div class="route"><div class="port"><div class="lab">From</div><div class="code">'+e(d.fromCode)+'</div><div class="city">'+e(d.fromCity)+'</div></div>'+
      '<div class="via">'+PLANE+'<div class="ac" data-fit="7.5">'+e(d.aircraft)+'</div></div>'+
      '<div class="port to"><div class="lab">To</div><div class="code">'+e(d.toCode)+'</div><div class="city">'+e(d.toCity)+'</div></div></div></div>'+
    '<div class="fields">'+
     '<div><div class="lab">Flight</div><div class="val" data-fit="10.5">'+e(d.flight)+'</div></div>'+
     '<div><div class="lab">Date</div><div class="val" data-fit="10.5">'+e(d.date)+'</div></div>'+
     '<div><div class="lab">Class</div><div class="val" data-fit="10.5">'+e(d.classEn)+'</div></div>'+
     '<div><div class="lab">Gate</div><div class="val big" data-fit="14">'+e(d.gate)+'</div></div>'+
     '<div><div class="lab">Boarding</div><div class="val big" data-fit="14">'+e(d.time)+'</div></div>'+
     '<div><div class="lab">Seat</div><div class="val big" data-fit="14">'+e(d.seat)+'</div></div></div>'+
    '<div class="pfoot">'+e(d.noteTh)+'</div>'+
   '</div><div class="barbox">'+bars(seed)+'</div></section>'+
   '<section class="stub"><div class="shead">'+img+'<span>ROYAL THAI<br>AIR FORCE</span></div>'+
    '<div><div class="lab">Passenger</div><div class="rkl"'+(d.hasRk?'':' hidden')+'>'+e(d.rankAbbr)+'</div><div class="name'+(!d.hasEn&&d.hasTh?' thl':'')+'" data-fit="10">'+e(d.stubName)+'</div></div>'+
    '<div class="sroute"><span>'+e(d.fromCode)+'</span>'+ARROW+'<span>'+e(d.toCode)+'</span></div>'+
    '<div class="sgrid"><div><div class="lab">Flight</div><div class="val">'+e(d.flight)+'</div></div><div><div class="lab">Date</div><div class="val">'+e(d.date)+'</div></div>'+
     '<div><div class="lab">Gate</div><div class="val">'+e(d.gate)+'</div></div><div><div class="lab">Boarding</div><div class="val">'+e(d.time)+'</div></div></div>'+
    '<div class="sbot">'+qr(seed)+'<div class="sseat"><div class="lab">Seat</div><div class="val" data-fit="21">'+e(d.seat)+'</div></div></div>'+
   '</section></div>';
}

/* A4: passes at 7.5 / 90 / 172.5 mm, 3.5 mm from each side; marks show the 6 cut lines
   (left and right edges + the 4 horizontal edges), the bottom 42 mm strip is waste */
var TOP=7.5,H=82.5,L=3.5,R=206.5;
function sheetHTML(list,paper){
  if(paper==='card')return list.map(function(d){return '<div class="bp-sheet card"><div class="bp-slot">'+passHTML(d)+'</div></div>'}).join('');
  var out='';
  for(var i=0;i<list.length;i+=3){
    var page=list.slice(i,i+3),s='<div class="bp-sheet a4">';
    page.forEach(function(d,k){s+='<div class="bp-slot" style="top:'+(TOP+k*H)+'mm">'+passHTML(d)+'</div>'});
    for(var k=0;k<=page.length;k++){var y=TOP+k*H;
      s+='<i class="bp-cut h" style="left:0;top:'+(y-.075)+'mm"></i><i class="bp-cut h" style="left:207mm;top:'+(y-.075)+'mm"></i>'}
    var yEnd=TOP+page.length*H;
    [L,R].forEach(function(x){s+='<i class="bp-cut v" style="left:'+(x-.075)+'mm;top:1mm"></i><i class="bp-cut v" style="left:'+(x-.075)+'mm;top:'+(yEnd+1.5)+'mm"></i>'});
    s+='<div class="bp-waste">แถบล่าง 42 มม. ตัดทิ้ง · ตัดตามขีดตัดทั้ง 6 แนว (ซ้าย ขวา และเส้นแบ่งบัตร)</div></div>';
    out+=s;
  }
  return out;
}
function fit(el){var max=+el.dataset.fit,s=max;el.style.fontSize=s+'pt';
  while(el.scrollWidth>el.clientWidth+0.5&&s>5){s-=.5;el.style.fontSize=s+'pt'}}
function fitAll(root){[].forEach.call(root.querySelectorAll('.bpx [data-fit]'),function(el){if(!el.hidden)fit(el)})}

/* preview: scaled sheets inside host */
function preview(host,list,paper,maxSheets){
  host.textContent='';
  var per=paper==='card'?1:3,shown=list.slice(0,maxSheets*per);
  var tmp=document.createElement('div');tmp.innerHTML=sheetHTML(shown,paper);
  var sheets=[].slice.call(tmp.children);
  sheets.forEach(function(sh){
    var frame=document.createElement('div');frame.className='bp-frame';
    var sc=document.createElement('div');sc.className='bp-scale';sc.appendChild(sh);frame.appendChild(sc);host.appendChild(frame);
  });
  fitAll(host);
  function scale(){var w=Math.max(200,host.clientWidth-28);
    [].forEach.call(host.querySelectorAll('.bp-frame'),function(f){var sc=f.firstChild,sh=sc.firstChild;
      var k=Math.min(1,w/sh.offsetWidth);sc.style.transform='scale('+k+')';f.style.width=sh.offsetWidth*k+'px';f.style.height=sh.offsetHeight*k+'px'})}
  scale();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){fitAll(host);scale()});
  return {shown:shown.length,scale:scale};
}

/* print through a hidden iframe so the app page is untouched */
function print(list,paper,done){
  var old=document.getElementById('bpFrame');if(old)old.remove();
  var f=document.createElement('iframe');f.id='bpFrame';f.setAttribute('aria-hidden','true');
  f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  var page=paper==='card'?'@page{size:203mm 82.5mm;margin:0}':'@page{size:A4 portrait;margin:0}';
  var html='<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Boarding Pass</title>'+
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600&family=Sarabun:wght@400;500;600&display=swap">'+
    '<link rel="stylesheet" href="'+esc(abs('boardingpass.css'))+'">'+
    '<style>'+page+'html,body{margin:0;padding:0;background:#fff}.bp-sheet{page-break-after:always;break-after:page}.bp-sheet:last-child{page-break-after:auto;break-after:auto}</style>'+
    '</head><body>'+sheetHTML(list,paper)+'</body></html>';
  var d=f.contentDocument;d.open();d.write(html);d.close();
  var w=f.contentWindow;
  function ready(){
    var imgs=[].slice.call(d.images).map(function(i){return i.complete?null:new Promise(function(ok){i.onload=i.onerror=ok})}).filter(Boolean);
    var links=[].slice.call(d.querySelectorAll('link[rel=stylesheet]')).map(function(l){return l.sheet?null:new Promise(function(ok){l.onload=l.onerror=ok;setTimeout(ok,4000)})}).filter(Boolean);
    return Promise.all(links.concat(imgs)).then(function(){return d.fonts&&d.fonts.ready?Promise.race([d.fonts.ready,new Promise(function(ok){setTimeout(ok,4000)})]):null});
  }
  ready().then(function(){fitAll(d);setTimeout(function(){w.focus();w.print();if(done)done()},150)});
}

window.BoardingPass={data:data,passHTML:passHTML,sheetHTML:sheetHTML,preview:preview,print:print,fitAll:fitAll,longDate:longDate,route:route};
})();
