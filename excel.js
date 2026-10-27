/* EXPORT TO EXCEL: builds an editable .xlsx of the seat plan that looks and pages like the PDF.
 * No spreadsheet library: the workbook XML is written here and zipped with JSZip.
 * window.SeatExcel.build(model) -> Promise<Blob>; the model is prepared by app.js (excelModel).
 * Page breaks: blocks (header, each zone, each 32-row chunk of the list) are packed onto A4 pages the
 * same way the PDF does, using a fixed print scale (Excel ignores manual breaks when "Fit to page" is on). */
(function(){
'use strict';
var FONT='Tahoma';
var C={ink:'14212E',muted:'566575',line:'C5D0DC',rowno:'35547C',cabin:'EEF4FA',accent:'1F5FA8',white:'FFFFFF',
  ok:'2E9D57',warn:'E2A400',bad:'D23B33',badSoft:'FBDAD7',crew:'D0102A',crewSoft:'FDE3E6',warnSoft:'FDF0C4'};
// columns: A margin · B row no · C D left · E aisle · F G H I centre · J aisle · K L right · M margin
var COLS=[1.5,5,10,10,2.5,10,10,10,10,2.5,10,10,1.5];
var LEFT=[3,4],CENTER=[6,7,8,9],RIGHT=[11,12],FIRST=2,LAST=13;

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')}
function colName(c){var s='';while(c>0){var m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=(c-m-1)/26}return s}
function ref(r,c){return colName(c)+r}
function clone(o){return JSON.parse(JSON.stringify(o||{}))}

/* ---------- sheet model ---------- */
function Sheet(){this.cells={};this.heights={};this.merges=[];this.row=1;this.blocks=[]}
Sheet.prototype.cell=function(r,c){var k=r+':'+c;if(!this.cells[k])this.cells[k]={r:r,c:c,v:null,s:{}};return this.cells[k]};
Sheet.prototype.set=function(r,c,v,s){var x=this.cell(r,c);if(v!=null)x.v=v;if(s)x.s=mergeStyle(x.s,s);return x};
Sheet.prototype.style=function(r1,c1,r2,c2,s){for(var r=r1;r<=r2;r++)for(var c=c1;c<=c2;c++)this.set(r,c,null,s)};
Sheet.prototype.merge=function(r1,c1,r2,c2,v,s){if(r2>r1||c2>c1)this.merges.push(ref(r1,c1)+':'+ref(r2,c2));this.set(r1,c1,v,null);if(s)this.style(r1,c1,r2,c2,s)};
Sheet.prototype.h=function(r,pt){this.heights[r]=pt};
/* outline a box: only the outer edges get the border */
Sheet.prototype.box=function(r1,c1,r2,c2,st,color){
  for(var c=c1;c<=c2;c++){this.set(r1,c,null,{border:{t:[st,color]}});this.set(r2,c,null,{border:{b:[st,color]}})}
  for(var r=r1;r<=r2;r++){this.set(r,c1,null,{border:{l:[st,color]}});this.set(r,c2,null,{border:{r:[st,color]}})}
};
function mergeStyle(a,b){var o=clone(a);Object.keys(b).forEach(function(k){
  if(k==='border'||k==='font'||k==='align'){o[k]=Object.assign({},o[k]||{},b[k])}else o[k]=b[k]});return o}

/* ---------- styles.xml from the style objects that were used ---------- */
function Styles(){this.fonts=[];this.fills=[];this.borders=[];this.xfs=[];this.fk={};this.flk={};this.bk={};this.xk={};
  this.font({});this.fill(null);this.fill('gray125');this.border({});this.xf({})}
Styles.prototype.font=function(f){var k=JSON.stringify(f);if(this.fk[k]==null){this.fk[k]=this.fonts.length;
  this.fonts.push('<font>'+(f.b?'<b/>':'')+(f.i?'<i/>':'')+'<sz val="'+(f.sz||9)+'"/><color rgb="FF'+(f.color||C.ink)+'"/><name val="'+FONT+'"/><family val="2"/></font>')}return this.fk[k]};
Styles.prototype.fill=function(rgb){var k=String(rgb);if(this.flk[k]==null){this.flk[k]=this.fills.length;
  this.fills.push(rgb==null?'<fill><patternFill patternType="none"/></fill>':rgb==='gray125'?'<fill><patternFill patternType="gray125"/></fill>':
    '<fill><patternFill patternType="solid"><fgColor rgb="FF'+rgb+'"/><bgColor indexed="64"/></patternFill></fill>')}return this.flk[k]};
Styles.prototype.border=function(b){var k=JSON.stringify(b);if(this.bk[k]==null){this.bk[k]=this.borders.length;
  var side=function(n,v){return v?'<'+n+' style="'+v[0]+'"><color rgb="FF'+v[1]+'"/></'+n+'>':'<'+n+'/>'};
  this.borders.push('<border>'+side('left',b.l)+side('right',b.r)+side('top',b.t)+side('bottom',b.b)+'<diagonal/></border>')}return this.bk[k]};
Styles.prototype.xf=function(s){var k=JSON.stringify(s);if(this.xk[k]==null){
  var fo=this.font(s.font||{}),fi=this.fill(s.fill||null),bo=this.border(s.border||{}),a=s.align||{};
  var al=(a.h||a.v||a.wrap)?'<alignment'+(a.h?' horizontal="'+a.h+'"':'')+' vertical="'+(a.v||'center')+'"'+(a.wrap?' wrapText="1"':'')+'/>':'<alignment vertical="center"/>';
  this.xk[k]=this.xfs.length;
  this.xfs.push('<xf numFmtId="49" fontId="'+fo+'" fillId="'+fi+'" borderId="'+bo+'" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'+al+'</xf>')}
  return this.xk[k]};
Styles.prototype.xml=function(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="'+this.fonts.length+'">'+this.fonts.join('')+'</fonts><fills count="'+this.fills.length+'">'+this.fills.join('')+'</fills>'+
    '<borders count="'+this.borders.length+'">'+this.borders.join('')+'</borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="'+this.xfs.length+'">'+this.xfs.join('')+'</cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'};

/* ---------- layout ---------- */
var S={
  title:{font:{b:1,sz:14}},
  lab:{font:{b:1,sz:7,color:C.muted}},
  val:{font:{b:1,sz:10}},
  meta:{font:{sz:8,color:C.muted}},
  warn:{font:{b:1,sz:9},fill:C.warnSoft,border:{l:['thin',C.warn],r:['thin',C.warn],t:['thin',C.warn],b:['thin',C.warn]}},
  zoneTitle:{font:{b:1,sz:11},fill:C.cabin},
  badge:{font:{b:1,sz:9,color:C.white},fill:C.accent,align:{h:'center'}},
  badgeZero:{font:{b:1,sz:9,color:C.white},fill:C.muted,align:{h:'center'}},
  cabin:{fill:C.cabin},
  rowno:{font:{b:1,sz:9,color:C.rowno},fill:C.cabin,align:{h:'right',v:'center'}},
  h2:{font:{b:1,sz:11}},
  th:{font:{b:1,sz:8,color:C.muted},border:{b:['thin',C.line]}},
  td:{font:{sz:9},border:{b:['thin',C.line]},align:{v:'center'}}
};
var MONC=[C.ok,C.warn,C.bad];

function seatCells(sh,r,c,seat,blank){
  // two rows: r = seat letter (top border = monitor bar), r+1 = name (bottom border = seat fault bar)
  var st=seat.s|0,crew=seat.crew,name=blank?'':(seat.name||''),occ=!!name;
  var line=crew?C.crew:st===2?C.bad:C.rowno,fill=C.white,fg=C.rowno;
  if(crew){fill=occ?C.crew:C.crewSoft;fg=occ?C.white:C.crew}
  else if(st===2){fill=occ?C.bad:C.badSoft;fg=occ?C.white:C.bad}
  else if(occ){fill=C.accent;fg=C.white;line=C.accent}
  var label=seat.label+(st===2?'  ×':st===1?'  !':'');
  var top=seat.mon!=null?['thick',MONC[seat.mon|0]]:['thin',line];
  var bottom=st===1?['thick',C.warn]:['thin',line];
  sh.set(r,c,label,{font:{b:1,sz:9,color:fg},fill:fill,align:{h:'center',v:'center'},border:{l:['thin',line],r:['thin',line],t:top}});
  sh.set(r+1,c,name,{font:{sz:8,color:occ?C.white:C.ink},fill:fill,align:{h:'center',v:'center',wrap:1},border:{l:['thin',line],r:['thin',line],b:bottom}});
}
/* which grid columns a seat group uses */
function groupCols(gi,len,ng){
  if(ng===5){return gi===0?[3]:gi===2?[7,8]:[12]}          // First Class: A · EF · K
  if(gi===0)return len===1?[3]:LEFT.slice(0,len);
  if(gi===ng-1)return len===1?[12]:RIGHT.slice(RIGHT.length-len);
  if(len===4)return CENTER;if(len===3)return [6,7,8];if(len===2)return [7,8];return [7];
}
function ovhSpan(gi,ng){return gi===0?[3,4]:gi===ng-1?[11,12]:[6,9]}

function build(m){
  var sh=new Sheet(),blank=!!m.blank,R;
  function blockStart(){return sh.row}
  function blockEnd(s){sh.blocks.push([s,sh.row-1]);sh.h(sh.row,8);sh.row++}  // spacer row after each block
  /* header */
  var b0=blockStart();R=sh.row;
  sh.merge(R,2,R,13,m.title,S.title);sh.h(R,24);R++;
  var slots=[[2,4],[5,7],[8,10],[11,13]];
  function infoCell(r,slot,span,label,val){var c1=slots[slot][0],c2=slots[slot+span-1][1];
    sh.merge(r,c1,r,c2,label,mergeStyle(S.lab,{border:{t:['thin',C.line]}}));sh.merge(r+1,c1,r+1,c2,val||'-',S.val);
    sh.box(r,c1,r+1,c2,'thin',C.line)}
  m.info.forEach(function(row){var s=0;row.forEach(function(it){infoCell(R,s,it.span||1,it.label,it.val);s+=it.span||1});sh.h(R,12);sh.h(R+1,18);R+=2});
  sh.merge(R,2,R,13,m.meta,mergeStyle(S.meta,{align:{wrap:1}}));sh.h(R,24);R++;
  if(m.warn){sh.merge(R,2,R,13,m.warn,mergeStyle(S.warn,{align:{wrap:1}}));sh.h(R,20);R++}
  sh.merge(R,2,R,13,m.legend,mergeStyle(S.meta,{align:{wrap:1}}));sh.h(R,26);R++;
  sh.row=R;blockEnd(b0);
  /* zones */
  m.zones.forEach(function(z){
    var b=blockStart();R=sh.row;
    sh.style(R,FIRST,R,LAST,S.cabin);sh.merge(R,FIRST,R,9,z.title,S.zoneTitle);
    sh.merge(R,11,R,12,z.noCount?(z.freeLabel||''):(z.freeLabel||'ที่นั่งว่าง ')+z.free,z.free?S.badge:S.badgeZero);sh.h(R,20);R++;
    sh.style(R,FIRST,R,LAST,S.cabin);sh.h(R,5);R++;
    var run=null;
    function endRun(){if(run){sh.box(run[0],3,R-1,12,'medium',C.crew);run=null}}
    z.items.forEach(function(it){
      if(it.crew&&!run){sh.style(R,FIRST,R,LAST,S.cabin);sh.merge(R,3,R,12,'CREW ZONE',{font:{b:1,sz:13,color:C.crew},fill:C.crewSoft,align:{h:'center'}});sh.h(R,20);run=[R];R++}
      if(!it.crew)endRun();
      if(it.type==='cc'){
        sh.style(R,FIRST,R+2,LAST,S.cabin);
        seatCells(sh,R+1,6,it.seat,blank);sh.merge(R+1,7,R+2,9,'Mission Commander',{font:{b:1,sz:9,color:C.muted},fill:C.cabin,align:{h:'left',v:'center'}});
        sh.box(R,5,R+3,10,'medium',C.muted);sh.style(R+3,FIRST,R+3,LAST,S.cabin);
        sh.h(R,6);sh.h(R+1,15);sh.h(R+2,26);sh.h(R+3,6);R+=4;return;
      }
      sh.style(R,FIRST,R+(it.type==='ovh'?0:1),LAST,S.cabin);
      if(it.type==='ovh'){
        it.mon.forEach(function(mv,gi){var sp=ovhSpan(gi,it.mon.length);
          sh.merge(R,sp[0],R,sp[1],'Monitor',{font:{b:1,sz:7,color:mv===2?C.white:C.ink},fill:MONC[mv|0],align:{h:'center'}})});
        sh.h(R,13);R++;return;
      }
      sh.merge(R,2,R+1,2,it.n,S.rowno);
      it.groups.forEach(function(g,gi){var cols=groupCols(gi,g.length,it.groups.length);
        g.forEach(function(seat,i){if(seat&&cols[i])seatCells(sh,R,cols[i],seat,blank)})});
      sh.h(R,15);sh.h(R+1,26);R+=2;
      sh.style(R,FIRST,R,LAST,S.cabin);sh.h(R,4);R++;
    });
    endRun();
    sh.style(R,FIRST,R,LAST,S.cabin);sh.h(R,6);R++;
    sh.box(b,FIRST,R-1,LAST,'thin',C.line);
    sh.row=R;blockEnd(b);
  });
  /* list */
  var CH=32,list=m.list,rows=blank?Array.apply(null,Array(m.blankRows||30)).map(function(){return null}):list;
  var cols=[[2,3,'ที่นั่ง'],[4,6,'โซน'],[7,9,'ยศ ชื่อ-สกุล (ไทย)'],[10,13,'RANK NAME (EN)']];
  if(!rows.length){var b1=blockStart();R=sh.row;sh.merge(R,2,R,13,m.listTitle,S.h2);sh.h(R,20);R++;sh.merge(R,2,R,13,'ยังไม่มีรายชื่อ',S.meta);R++;sh.row=R;blockEnd(b1)}
  for(var i=0;i<rows.length;i+=CH){
    var bb=blockStart();R=sh.row;
    sh.merge(R,2,R,13,m.listTitle+(blank?'':' ('+list.length+' คน)')+(i?' ต่อ':''),S.h2);sh.h(R,20);R++;
    cols.forEach(function(c){sh.merge(R,c[0],R,c[1],c[2],S.th)});sh.h(R,16);R++;
    rows.slice(i,i+CH).forEach(function(p){
      var v=p?[p.id,p.zone,p.th,p.en]:['','','',''];
      cols.forEach(function(c,k){sh.merge(R,c[0],R,c[1],v[k],mergeStyle(S.td,k===0?{font:{b:1,sz:9}}:{}))});sh.h(R,18);R++;
    });
    sh.row=R;blockEnd(bb);
  }
  return toXlsx(sh,m);
}

/* ---------- pages: same greedy packing as the PDF ---------- */
function pageSetup(sh){
  var px=COLS.reduce(function(a,w){return a+Math.floor(w*7+5)},0),wPt=px*0.75;
  var usableW=(8.27-0.6)*72,usableH=(11.69-0.8-0.3)*72;
  var scale=Math.max(40,Math.min(100,Math.floor(usableW/wPt*100)));
  var avail=usableH/(scale/100),cur=0,breaks=[];
  var hOf=function(r){return sh.heights[r]!=null?sh.heights[r]:15};
  sh.blocks.forEach(function(b){var h=0;for(var r=b[0];r<=b[1]+1;r++)h+=hOf(r);
    if(cur>0&&cur+h>avail){breaks.push(b[0]-1);cur=0}cur+=h});
  return {scale:scale,breaks:breaks};
}

function toXlsx(sh,m){
  var st=new Styles(),byRow={},maxR=1;
  Object.keys(sh.cells).forEach(function(k){var x=sh.cells[k];(byRow[x.r]=byRow[x.r]||[]).push(x);if(x.r>maxR)maxR=x.r});
  Object.keys(sh.heights).forEach(function(r){if(+r>maxR)maxR=+r});
  var rowsXml='';
  for(var r=1;r<=maxR;r++){
    var cs=(byRow[r]||[]).sort(function(a,b){return a.c-b.c}),ht=sh.heights[r];
    if(!cs.length&&ht==null)continue;
    rowsXml+='<row r="'+r+'"'+(ht!=null?' ht="'+ht+'" customHeight="1"':'')+'>';
    cs.forEach(function(x){var s=st.xf(x.s);
      if(x.v==null||x.v==='')rowsXml+='<c r="'+ref(x.r,x.c)+'" s="'+s+'"/>';
      else rowsXml+='<c r="'+ref(x.r,x.c)+'" s="'+s+'" t="inlineStr"><is><t xml:space="preserve">'+esc(x.v)+'</t></is></c>'});
    rowsXml+='</row>';
  }
  var ps=pageSetup(sh);
  var cols='<cols>'+COLS.map(function(w,i){return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>'}).join('')+'</cols>';
  var sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<dimension ref="A1:M'+maxR+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="100" view="pageBreakPreview" zoomScaleSheetLayoutView="100"/></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="15"/>'+cols+'<sheetData>'+rowsXml+'</sheetData>'+
    (sh.merges.length?'<mergeCells count="'+sh.merges.length+'">'+sh.merges.map(function(x){return '<mergeCell ref="'+x+'"/>'}).join('')+'</mergeCells>':'')+
    '<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>'+
    '<pageSetup paperSize="9" orientation="portrait" scale="'+ps.scale+'"/>'+
    '<headerFooter><oddFooter>&amp;L'+esc(m.footer||'')+'&amp;Rหน้า &amp;P / &amp;N</oddFooter></headerFooter>'+
    (ps.breaks.length?'<rowBreaks count="'+ps.breaks.length+'" manualBreakCount="'+ps.breaks.length+'">'+ps.breaks.map(function(b){return '<brk id="'+b+'" max="16383" man="1"/>'}).join('')+'</rowBreaks>':'')+
    '</worksheet>';
  var sheetName=m.sheetName||'Seat Plan';
  var wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<bookViews><workbookView/></bookViews><sheets><sheet name="'+esc(sheetName)+'" sheetId="1" r:id="rId1"/></sheets>'+
    '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\''+esc(sheetName.replace(/'/g,"''"))+'\'!$A$1:$M$'+maxR+'</definedName></definedNames></workbook>';
  var zip=new window.JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('docProps/core.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'+
    '<dc:title>'+esc(m.docTitle||'')+'</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString().replace(/\.\d+Z$/,'Z')+'</dcterms:created></cp:coreProperties>');
  zip.file('xl/workbook.xml',wb);
  zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml',sheet);
  zip.file('xl/styles.xml',st.xml());
  return zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

window.SeatExcel={build:build};
})();
