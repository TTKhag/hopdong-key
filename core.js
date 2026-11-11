(function(g){
const own=n=>{while(n&&n.nodeName!=='w:p')n=n.parentNode;return n};
const inTc=n=>{while(n&&n.nodeName!=='w:tc')n=n.parentNode;return!!n};
const nz=s=>s.replace(/[\s\u00a0]+/g,' ').replace(/[.…_\-–]{2,}/g,'…').trim();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&');
const rx=s=>s.replace(/[\t\n\u00a0]/g,' ').split(/([.…_\-–]{2,}|\s+)/).filter(x=>x!=='').map(p=>/^[.…_\-–]{2,}$/.test(p)?'[.…_\\-–]+':/^\s+$/.test(p)?'\\s*':esc(p)).join('');
/* Tiền xử lý: mỗi đoạn (thân, ô bảng, header, footer) thành một đơn vị có id, vị trí, ứng viên. Không loại bỏ đoạn nào có chữ. */
function segs(parts,ext){const out=[];parts.forEach(p=>{const d=ext==='docx',pn=/header/.test(p.name)?'Đầu trang':/footer/.test(p.name)?'Chân trang':'Thân';
 [...p.doc.getElementsByTagName(d?'w:p':'si')].forEach(u=>{
  const items=d?[...u.getElementsByTagName('*')].filter(n=>['w:t','w:tab','w:br','w:cr'].includes(n.nodeName)&&own(n)===u&&n.parentNode.nodeName!=='w:tabs'):[...u.getElementsByTagName('t')].filter(n=>n.parentNode.nodeName!=='rPh');
  const ed=n=>n.nodeName==='w:t'||n.nodeName==='t',ch=items.map(n=>ed(n)?n.textContent:n.nodeName==='w:tab'?'\t':'\n'),raw=ch.join(''),tc=d&&inTc(u),empty=!raw.trim();
  if(empty&&!tc)return;const text=raw.replace(/[\t\n\r\u00a0]/g,' '),cand=[];
  if(empty)cand.push('ô trống');else{if(/[.…_]{3,}/.test(text))cand.push('dấu chấm/gạch');if(/ngày\s*[.…_\s]*tháng|tháng\s*[.…_\s]*năm/i.test(text))cand.push('ngày tháng');if(raw.includes('\t'))cand.push('có Tab');if(/\([^)]{3,}\)/.test(text))cand.push('gợi ý trong ngoặc');if(/:\s*\S/.test(text)||/:\s*$/.test(text))cand.push('sau dấu hai chấm')}
  out.push({id:out.length,u,doc:p.doc,items,ed,lens:ch.map(x=>x.length),text,where:pn+(tc?' · bảng':''),cand,empty})})});return out}
const lines=(S,ids)=>(ids?S.filter(s=>ids.has(s.id)):S).map(s=>`P${s.id} | ${s.where} | ${s.cand.length?'ứng viên: '+s.cand.join(', '):'-'} | ${s.empty?'(trống)':s.text.trim()}`);
function find(s,f,used,loose){const generic=!/[\p{L}\d]/u.test(f.original),L=[[f.before,f.after,0],[f.before,'',0]];if(!loose){L.push(['',f.after,0]);if(!generic)L.push(['','',1])}
 for(const[b,a,uq]of L){if(generic&&!b&&!a)continue;if(loose&&!b)continue;if(uq&&(s.text.match(new RegExp(rx(f.original),'g'))||[]).length!==1)continue;
  const re=new RegExp('('+rx(b||'')+')('+rx(f.original)+')'+(a?'(?='+rx(a)+')':''),'g');let m;
  while((m=re.exec(s.text))){const st=m.index+m[1].length,en=st+m[2].length;if(en>st&&!used.some(r=>r.s===s&&st<r.en&&en>r.st))return{st,en};if(!m[0].length)re.lastIndex++}}
 return null}
/* Giai đoạn 1: kiểm tra và xác định vị trí chính xác (đoạn + offset). Ưu tiên mã đoạn AI trả về; không chắc chắn thì không thay, chỉ ghi chú. */
function plan(S,fields){const used=[];fields.forEach(f=>{f.hits=0;f.blocked='';f.note=''});
 for(const f of fields){if(f.on===false||!f.key||(f.original||'').includes('{{'))continue;
  if(!f.original){const s=S[f.ref];if(s&&s.empty&&!used.some(r=>r.s===s)){used.push({s,st:0,en:0,f,ins:1});f.hits=1}else f.note='Không xác định được ô trống';continue}
  let hit=null;const s0=S[f.ref];if(s0){const r=find(s0,f,used);if(r)hit={...r,s:s0}}
  if(!hit){const c=nz(f.context||''),cand=c?S.filter(s=>{const t=nz(s.text);return t&&(t.includes(c)||(t.length>=8&&c.includes(t)))}):[];
   for(const s of[...cand,...S.filter(s=>!cand.includes(s))]){const r=find(s,f,used,true);if(r){hit={...r,s};f.note='Tìm theo nhãn/ngữ cảnh, cần kiểm tra';break}}}
  if(!hit){f.note='Không xác định chính xác vị trí – cần kiểm tra';continue}
  if(/^\s*(\d+[.)]\s*)?Căn cứ/i.test(hit.s.text)&&/\d/.test(f.original)){f.blocked='văn bản pháp luật cố định';f.note='';continue}
  used.push({s:hit.s,st:hit.st,en:hit.en,f});f.hits++}
 return used}
function splice(sg,s,e,rep){let pos=0,done=false;sg.items.forEach((n,i)=>{const L=sg.lens[i],a=pos,b=pos+L;pos=b;if(!L||!sg.ed(n)||b<=s||a>=e)return;const x=n.textContent;
 n.textContent=x.slice(0,Math.max(s,a)-a)+(done?'':rep)+x.slice(Math.min(e,b)-a);done=true;n.setAttribute('xml:space','preserve')})}
/* Giai đoạn 2: thay từ phải sang trái, chỉ sửa node chữ nên giữ nguyên định dạng run; ô trống thì chèn run mới. */
function execute(used){[...used].sort((x,y)=>y.st-x.st).forEach(u=>{const k='{{'+u.f.key+'}}';
 if(u.ins){const ns=u.s.u.namespaceURI,r=u.s.doc.createElementNS(ns,'w:r'),t=u.s.doc.createElementNS(ns,'w:t');t.textContent=k;r.appendChild(t);u.s.u.appendChild(r)}else splice(u.s,u.st,u.en,k)})}
const verify=S=>S.filter(s=>/[.…_\-–]{4,}/.test(s.text)).map(s=>s.text.trim().slice(0,140));
const C={segs,lines,find,plan,execute,verify,nz};g.Core=C;if(typeof module!=='undefined')module.exports=C})(typeof window!=='undefined'?window:globalThis);
