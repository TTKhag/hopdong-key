(function(g){
const own=n=>{while(n&&n.nodeName!=='w:p')n=n.parentNode;return n};
const nz=s=>s.replace(/[\s\u00a0]+/g,' ').replace(/[.…_\-–]{2,}/g,'…').trim();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&');
const rx=s=>s.replace(/[\t\n\u00a0]/g,' ').split(/([.…_\-–]{2,}|\s+)/).filter(x=>x!=='').map(p=>/^[.…_\-–]{2,}$/.test(p)?'[.…_\\-–]+':/^\s+$/.test(p)?'\\s*':esc(p)).join('');
/* Trích xuất từng đoạn (kể cả ô bảng, header, footer) cùng danh sách node text; tab/xuống dòng chiếm 1 ký tự để giữ vị trí */
function segs(parts,ext){const out=[];parts.forEach(p=>{const d=ext==='docx';
 [...p.doc.getElementsByTagName(d?'w:p':'si')].forEach(u=>{
  const items=d?[...u.getElementsByTagName('*')].filter(n=>['w:t','w:tab','w:br','w:cr'].includes(n.nodeName)&&own(n)===u&&n.parentNode.nodeName!=='w:tabs'):[...u.getElementsByTagName('t')].filter(n=>n.parentNode.nodeName!=='rPh');
  const ed=n=>n.nodeName==='w:t'||n.nodeName==='t',ch=items.map(n=>ed(n)?n.textContent:n.nodeName==='w:tab'?'\t':'\n'),raw=ch.join('');
  if(raw.trim())out.push({items,ed,lens:ch.map(x=>x.length),text:raw.replace(/[\t\n\r\u00a0]/g,' ')})})});return out}
function find(s,f,used){const generic=!/[\p{L}\d]/u.test(f.original);
 for(const[b,a]of[[f.before,f.after],[f.before,''],['',f.after],['','']]){if(generic&&!b&&!a)continue;
  const re=new RegExp('('+rx(b||'')+')('+rx(f.original)+')'+(a?'(?='+rx(a)+')':''),'g');let m;
  while((m=re.exec(s.text))){const st=m.index+m[1].length,en=st+m[2].length;if(en>st&&!used.some(r=>r.s===s&&st<r.en&&en>r.st))return{st,en};if(!m[0].length)re.lastIndex++}}
 return null}
/* Giai đoạn 1: xác định vị trí chính xác (đoạn + offset) trên văn bản gốc, không sửa gì */
function plan(S,fields){const used=[];fields.forEach(f=>{f.hits=0;f.blocked=''});
 for(const f of fields){if(f.on===false||!f.original||!f.key||f.original.includes('{{'))continue;
  const c=nz(f.context||''),cand=c?S.filter(s=>{const t=nz(s.text);return t&&(t.includes(c)||(t.length>=8&&c.includes(t)))}):[];
  let hit=null;for(const s of[...cand,...S.filter(s=>!cand.includes(s))]){const r=find(s,f,used);if(r){hit={...r,s};break}}
  if(!hit)continue;
  if(/^\s*(\d+[.)]\s*)?Căn cứ/i.test(hit.s.text)&&/\d/.test(f.original)){f.blocked='văn bản pháp luật cố định';continue}
  used.push({s:hit.s,st:hit.st,en:hit.en,f});f.hits++}
 return used}
function splice(sg,s,e,rep){let pos=0,done=false;sg.items.forEach((n,i)=>{const L=sg.lens[i],a=pos,b=pos+L;pos=b;if(!L||!sg.ed(n)||b<=s||a>=e)return;const x=n.textContent;
 n.textContent=x.slice(0,Math.max(s,a)-a)+(done?'':rep)+x.slice(Math.min(e,b)-a);done=true;n.setAttribute('xml:space','preserve')})}
/* Giai đoạn 2: thay từ phải sang trái trong mỗi đoạn để offset không bị lệch; chỉ sửa node chữ nên giữ nguyên định dạng run */
function execute(used){[...used].sort((x,y)=>y.st-x.st).forEach(u=>splice(u.s,u.st,u.en,'{{'+u.f.key+'}}'))}
const verify=S=>S.filter(s=>/[.…_\-–]{4,}/.test(s.text)).map(s=>s.text.trim().slice(0,140));
const C={segs,plan,execute,verify,nz};g.Core=C;if(typeof module!=='undefined')module.exports=C})(typeof window!=='undefined'?window:globalThis);
