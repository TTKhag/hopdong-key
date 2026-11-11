'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.ceil(n/1024)+' KB',dt=t=>new Date(t).toLocaleString('vi-VN');
function toast(m,e){const d=document.createElement('div');d.textContent=m;if(e)d.className='e';$('#toasts').append(d);setTimeout(()=>d.remove(),e?8000:3500)}
function modal(h){const o=document.createElement('div');o.className='ov';o.innerHTML='<div>'+h+'<p><button class=cl>Đóng</button></p></div>';o.onclick=e=>{if(e.target===o||e.target.className==='cl')o.remove()};document.body.append(o)}
const dl=(data,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
/* ---------- IndexedDB ---------- */
const STORES=['files','results','settings'];let db;
const openDB=()=>new Promise((ok,no)=>{const r=indexedDB.open('hopdong-keygen',1);r.onupgradeneeded=()=>STORES.forEach(s=>r.result.createObjectStore(s,{keyPath:'id'}));r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const rq=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const dbAll=s=>rq(db.transaction(s).objectStore(s).getAll()),dbGet=(s,id)=>rq(db.transaction(s).objectStore(s).get(id));
const dbPut=(s,v)=>rq(db.transaction(s,'readwrite').objectStore(s).put(v)),dbDel=(s,id)=>rq(db.transaction(s,'readwrite').objectStore(s).delete(id));
const getSet=async(id,def)=>(await dbGet('settings',id))?.value??def,setSet=(id,value)=>dbPut('settings',{id,value});
/* ---------- Prompt mặc định ---------- */
const DEFAULT_PROMPT=`Bạn là chuyên gia phân tích nghiệp vụ HRM. Đầu vào là các đoạn văn bản (mỗi dòng một đoạn) trích từ một mẫu hợp đồng lao động. Hãy xác định các trường dữ liệu cần nhập và đề xuất Key để làm mẫu hợp đồng.
Quy tắc:
1. Key dạng PascalCase tiếng Việt không dấu, ngắn gọn, đúng nghiệp vụ HRM (ví dụ HoTenNhanVien, TenDonVi, NgayKyHopDong). Chỉ gồm chữ cái, số, gạch dưới; không viết dấu {{ }}.
2. Các trường đồng nghĩa dùng chung một Key (ví dụ "Tên công ty", "Tên doanh nghiệp" -> TenDonVi). Không sinh Key trùng lặp cho cùng một ý nghĩa.
3. Ngày/tháng/năm có nhiều chỗ trống nhưng cùng một ngày chỉ dùng một Key (ví dụ "ngày ... tháng ... năm ..." -> NgayKyHopDong). Các ngày khác ý nghĩa (ngày sinh, ngày bắt đầu, ngày cấp CCCD...) dùng Key khác nhau.
4. Phân biệt các trường khác ý nghĩa, không gộp tùy tiện.
5. Không suy diễn dữ liệu và không tạo Key cho nội dung không phải trường thông tin cần nhập (điều khoản, tiêu đề, nội dung cố định).
6. "original" là phần dữ liệu mẫu hoặc dấu chấm/gạch cần thay, chép CHÍNH XÁC từng ký tự từ văn bản. Với ngày tháng, "original" là toàn bộ cụm (ví dụ "ngày 01 tháng 11 năm 2026" hoặc "ngày ... tháng ... năm ..."), không để sót chữ ngày, tháng, năm.
7. "before" là nhãn đứng ngay trước "original" trong cùng đoạn, chép chính xác (kể cả dấu hai chấm và khoảng trắng); để chuỗi rỗng nếu không cần. Nhãn được giữ nguyên.
8. Mỗi vị trí cần thay là một phần tử; cùng một Key có thể xuất hiện ở nhiều phần tử.
Chỉ trả về JSON hợp lệ, không giải thích: {"fields":[{"key":"HoTenNhanVien","before":"Họ tên nhân viên: ","original":"Nguyễn Văn A"}]}`;
/* ---------- Xử lý docx/xlsx (hoàn toàn bằng code) ---------- */
const TN=e=>e==='docx'?'w:t':'t';
const units=(d,e)=>[...d.getElementsByTagName(e==='docx'?'w:p':'si')];
const tnodes=(u,e)=>[...u.getElementsByTagName(TN(e))].filter(t=>t.parentNode.nodeName!=='rPh');
const utext=(u,e)=>tnodes(u,e).map(t=>t.textContent).join('');
async function loadParts(buf,ext){const zip=await JSZip.loadAsync(buf);const re=ext==='docx'?/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/:/^xl\/sharedStrings\.xml$/;
 const parts=[];for(const n of Object.keys(zip.files).filter(n=>re.test(n))){const doc=new DOMParser().parseFromString(await zip.file(n).async('string'),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('XML lỗi: '+n);parts.push({name:n,doc})}
 if(!parts.length)throw new Error('File không đúng cấu trúc '+ext);return{zip,parts}}
function splice(ts,s,e,rep){let pos=0,done=false;for(const t of ts){const x=t.textContent,a=pos,b=pos+x.length;pos=b;if(b<=s||a>=e)continue;
 t.textContent=x.slice(0,Math.max(s,a)-a)+(done?'':rep)+x.slice(Math.min(e,b)-a);done=true;t.setAttribute('xml:space','preserve')}}
function apply(parts,ext,fields){for(const{doc}of parts)for(const u of units(doc,ext)){const ts=tnodes(u,ext);if(!ts.length)continue;
 for(const f of fields){const bf=f.before||'',nd=bf+f.original,rep='{{'+f.key+'}}';if(!f.original)continue;let from=0;
  for(;;){const txt=ts.map(t=>t.textContent).join(''),i=txt.indexOf(nd,from);if(i<0)break;const s=i+bf.length;splice(ts,s,s+f.original.length,rep);f.hits=(f.hits||0)+1;from=s+rep.length}}}}
const xml=d=>{const s=new XMLSerializer().serializeToString(d);return s.startsWith('<?xml')?s:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+s};
async function textLines(buf,ext){const{parts}=await loadParts(buf,ext),out=[];parts.forEach(p=>units(p.doc,ext).forEach(u=>{const t=utext(u,ext).trim();if(t)out.push(t)}));return out}
/* ---------- AI ---------- */
const quota=h=>{const g=(...n)=>n.map(x=>h.get(x)).find(Boolean);const r=+g('x-ratelimit-remaining-tokens','anthropic-ratelimit-tokens-remaining'),l=+g('x-ratelimit-limit-tokens','anthropic-ratelimit-tokens-limit'),t=g('x-ratelimit-reset-tokens','anthropic-ratelimit-tokens-reset');return r&&l?`${Math.round(r/l*100)}% token còn lại${t?' · hồi: '+t:''}`:''};
async function callAI(k,prompt,text){let url,hd={},body,pick;
 if(k.provider==='gemini'){url=`https://generativelanguage.googleapis.com/v1beta/models/${k.model}:generateContent?key=${encodeURIComponent(k.key)}`;body={contents:[{parts:[{text:prompt+'\n\n=== VĂN BẢN ===\n'+text}]}],generationConfig:{responseMimeType:'application/json',temperature:0}};
  pick=j=>[j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')||'',j.usageMetadata?.promptTokenCount||0,j.usageMetadata?.candidatesTokenCount||0]}
 else if(k.provider==='anthropic'){url=(k.baseUrl||'https://api.anthropic.com')+'/v1/messages';hd={'x-api-key':k.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'};body={model:k.model,max_tokens:8000,temperature:0,system:prompt,messages:[{role:'user',content:text}]};
  pick=j=>[j.content?.map(c=>c.text||'').join('')||'',j.usage?.input_tokens||0,j.usage?.output_tokens||0]}
 else{url=(k.baseUrl||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';hd={Authorization:'Bearer '+k.key};body={model:k.model,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:prompt},{role:'user',content:text}]};
  pick=j=>[j.choices?.[0]?.message?.content||'',j.usage?.prompt_tokens||0,j.usage?.completion_tokens||0]}
 let err;for(let a=1;a<=3;a++){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...hd},body:JSON.stringify(body)});
  if(r.ok){const[t,tin,tout]=pick(await r.json());return{text:t,tin,tout,quota:quota(r.headers)}}
  err=new Error(`API lỗi ${r.status}: ${(await r.text()).slice(0,300)}`);if(r.status!==429&&r.status<500)throw Object.assign(err,{fatal:1})}catch(e){if(e.fatal)throw e;err=err||e}
  await new Promise(s=>setTimeout(s,1500*a*a))}
 throw err}
function parseFields(t){const o=JSON.parse(t.replace(/^```(?:json)?|```$/gm,'').trim());return(Array.isArray(o)?o:o.fields||[]).map(f=>({key:String(f.key||'').replace(/[^A-Za-z0-9_]/g,''),before:String(f.before||''),original:String(f.original||'')})).filter(f=>f.key&&f.original)}
const keys=()=>getSet('keys',[]);
async function activeKey(){const id=await getSet('activeKey',null);return(await keys()).find(k=>k.id===id)}
async function analyze(rec){const k=await activeKey();if(!k)throw new Error('Chưa chọn API Key trong trang Cấu hình AI.');
 const lines=[...new Set(await textLines(rec.data,rec.ext))],chunks=[];let c='';for(const l of lines){if(c.length+l.length>12000&&c){chunks.push(c);c=''}c+=l+'\n'}if(c)chunks.push(c);
 const prompt=await getSet('prompt',DEFAULT_PROMPT);let all=[],tin=0,tout=0,q='';
 for(const ch of chunks){const r=await callAI(k,prompt,ch);all.push(...parseFields(r.text));tin+=r.tin;tout+=r.tout;q=r.quota||q}
 const seen=new Set();rec.analysis=all.filter(f=>{const s=f.key+'|'+f.before+'|'+f.original;return!seen.has(s)&&seen.add(s)});
 const cost=k.pin||k.pout?(tin*(k.pin||0)+tout*(k.pout||0))/1e6:null;rec.usage={tin,tout,cost};await dbPut('files',rec);
 const ks=await keys(),kk=ks.find(x=>x.id===k.id);kk.used=(kk.used||0)+tin+tout;if(q)kk.quota=q;await setSet('keys',ks);
 await log({t:Date.now(),file:rec.name,action:'Phân tích AI ('+k.name+')',tin,tout,cost,n:rec.analysis.length})}
async function log(e){const h=await getSet('history',[]);h.unshift(e);await setSet('history',h.slice(0,200))}
async function build(rec){const{zip,parts}=await loadParts(rec.data,rec.ext),fields=rec.analysis.map(f=>({...f,hits:0}));apply(parts,rec.ext,fields);
 parts.forEach(p=>zip.file(p.name,xml(p.doc)));const data=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
 rec.analysis=fields;await dbPut('files',rec);
 await dbPut('results',{id:rec.id,name:rec.name.replace(/(\.\w+)$/,'_mau$1'),data,created:Date.now(),keys:[...new Set(fields.filter(f=>f.hits).map(f=>f.key))]});
 await log({t:Date.now(),file:rec.name,action:'Chèn Key',n:fields.filter(f=>f.hits).length});return fields.filter(f=>!f.hits)}
async function preview(id){const r=await dbGet('results',id),ext=r.name.split('.').pop().toLowerCase();const l=await textLines(r.data,ext);
 modal(`<h3>Xem trước (văn bản) – ${esc(r.name)}</h3><p class=muted>Hiển thị nội dung văn bản; định dạng gốc được giữ trong file tải về.</p><pre>${esc(l.join('\n')).replace(/\{\{\w+\}\}/g,m=>'<mark>'+m+'</mark>')}</pre>`)}
/* ---------- Trang ---------- */
let sess=[],cur=null,tab='keys';
async function home(){const[f,r]=[await dbAll('files'),await dbAll('results')];$('#main').innerHTML=`<h2>Trang chủ</h2><div class=card><b>${f.length}</b> file gốc · <b>${r.length}</b> file mẫu đã tạo trong thư viện trên trình duyệt này.</div>
<div class=card><h3>Hướng dẫn sử dụng</h3><ol><li>Vào <a href="#ai">Cấu hình AI</a>, thêm API Key rồi bấm <b>Dùng</b> (Gemini, OpenAI/tương thích hoặc Anthropic).</li><li>Vào <a href="#process">Xử lý file</a>, chọn một hoặc nhiều file .docx/.xlsx, bấm <b>Phân tích bằng AI</b>.</li><li>Mở <b>Xem/Sửa Key</b>: đổi tên Key (đặt trùng tên để gộp), xóa Key không cần.</li><li>Bấm <b>Chèn Key &amp; tạo file mẫu</b>, xem trước và tải xuống. File gốc không bị ghi đè.</li><li>Vào <a href="#library">Thư viện</a> để quản lý file, sao lưu/khôi phục.</li></ol>
<p class=muted>File đã xử lý (cùng nội dung hash) sẽ dùng lại kết quả đã lưu, không gọi lại AI. Xuất sang .xlsx: chỉ xử lý chuỗi trong sharedStrings.</p></div>`}
async function processPage(){$('#main').innerHTML=`<h2>Xử lý file</h2><div class=card><div class=row><input type=file id=fi multiple accept=".docx,.xlsx"><button class=pri id=bAn>Phân tích bằng AI</button></div><div id=ak class=muted></div></div><div id=lst></div><div id=rev></div>`;
 const k=await activeKey();$('#ak').textContent=k?`Đang dùng API Key: ${k.name} (${k.provider}/${k.model})`:'Chưa chọn API Key – vào Cấu hình AI.';
 $('#fi').onchange=async e=>{for(const f of e.target.files){const ext=f.name.split('.').pop().toLowerCase();if(!['docx','xlsx'].includes(ext)){toast(`Bỏ qua ${f.name}: chỉ hỗ trợ .docx/.xlsx`,1);continue}
  const data=await f.arrayBuffer(),id=await sha(data);if(!await dbGet('files',id)){const n=(await dbAll('files')).filter(x=>x.name===f.name).length;await dbPut('files',{id,name:f.name,ext,size:f.size,data,added:Date.now(),version:n+1,analysis:null})}
  else toast(`${f.name}: file trùng nội dung, dùng lại dữ liệu đã lưu`);if(!sess.includes(id))sess.push(id)}e.target.value='';list()};
 $('#bAn').onclick=async()=>{$('#bAn').disabled=true;for(const id of sess){const rec=await dbGet('files',id);if(rec.analysis)continue;
  try{rec.err='';$('#lst').dataset.busy=id;await list(id);await analyze(rec)}catch(e){rec.err=e.message;await dbPut('files',rec);toast(rec.name+': '+e.message,1)}}
  $('#lst').dataset.busy='';$('#bAn').disabled=false;list()};list()}
async function list(busy){let h='<div class=card><table><tr><th>File</th><th>Trạng thái</th><th></th></tr>';
 for(const id of sess){const r=await dbGet('files',id),o=await dbGet('results',id);if(!r)continue;
  const st=busy===id?'Đang phân tích…':r.err?`<span class=err>${esc(r.err)}</span>`:o?'<span class=ok>Đã tạo mẫu (dùng kết quả đã lưu)</span>':r.analysis?`Đã phân tích: ${r.analysis.length} vị trí${r.usage?` · ${r.usage.tin}+${r.usage.tout} token`+(r.usage.cost!=null?` · ~$${r.usage.cost.toFixed(4)}`:''):''}`:'Chưa phân tích';
  h+=`<tr><td>${esc(r.name)}<br><span class=muted>v${r.version} · ${fmt(r.size)}</span></td><td>${st}</td><td>${r.analysis?`<button data-a=rev data-id=${id}>Xem/Sửa Key</button> `:''}${o?`<button data-a=pv data-id=${id}>Xem trước</button> <button data-a=dl data-id=${id}>Tải mẫu</button>`:''}</td></tr>`}
 $('#lst').innerHTML=h+(sess.length?'':'<tr><td colspan=3 class=muted>Chưa chọn file nào.</td></tr>')+'</table></div>';
 $('#lst').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.id;if(b.dataset.a==='pv')preview(id);else if(b.dataset.a==='dl'){const o=await dbGet('results',id);dl(o.data,o.name)}else{cur=await dbGet('files',id);review()}}}
function review(){const f=cur.analysis,cnt={};f.forEach(x=>cnt[x.key]=(cnt[x.key]||0)+1);
 $('#rev').innerHTML=`<div class=card><h3>Danh sách Key – ${esc(cur.name)}</h3><p class=muted>Đổi tên Key trùng với Key khác để gộp. Xóa dòng để bỏ Key.</p><table><tr><th>Key</th><th>Nhãn trước</th><th>Dữ liệu thay thế</th><th>Kết quả</th><th></th></tr>${f.map((x,i)=>`<tr><td><input data-i=${i} value="${esc(x.key)}" size=22></td><td>${esc(x.before)}</td><td>${esc(x.original)}</td><td>${x.hits==null?'':x.hits?`<span class=ok>${x.hits} vị trí</span>`:'<span class=err>không tìm thấy</span>'}</td><td><button class=del data-d=${i}>Xóa</button></td></tr>`).join('')}</table>
 <p class=muted>${Object.keys(cnt).length} Key khác nhau.</p><button class=pri id=bb>Chèn Key &amp; tạo file mẫu</button></div>`;
 $('#rev').oninput=e=>{if(e.target.dataset.i!=null)f[e.target.dataset.i].key=e.target.value.replace(/[^A-Za-z0-9_]/g,'')};
 $('#rev').onclick=async e=>{if(e.target.dataset.d!=null){f.splice(e.target.dataset.d,1);review()}
  if(e.target.id==='bb'){cur.analysis=f.filter(x=>x.key);try{const miss=await build(cur);toast(miss.length?`Xong. ${miss.length} vị trí không tìm thấy trong file.`:'Đã tạo file mẫu.',miss.length);review();list()}catch(er){toast('Lỗi: '+er.message,1)}}}}
async function library(){const[F,R,H]=[await dbAll('files'),await dbAll('results'),await getSet('history',[])];const rm=new Set(R.map(r=>r.id));
 $('#main').innerHTML=`<h2>Thư viện</h2><div class=card><h3>File gốc</h3><table><tr><th>Tên</th><th>Phiên bản</th><th>Kích thước</th><th>Ngày nạp</th><th>Mẫu</th><th></th></tr>${F.map(f=>`<tr><td>${esc(f.name)}</td><td>v${f.version}</td><td>${fmt(f.size)}</td><td>${dt(f.added)}</td><td>${rm.has(f.id)?'Có':'Chưa'}</td><td><button data-a=info data-id=${f.id}>Thông tin</button> <button data-a=dlo data-id=${f.id}>Tải gốc</button> <button class=del data-a=del data-id=${f.id}>Xóa</button></td></tr>`).join('')||'<tr><td colspan=6 class=muted>Thư viện trống.</td></tr>'}</table></div>
 <div class=card><h3>File đã xử lý</h3><table><tr><th>Tên</th><th>Số Key</th><th>Ngày tạo</th><th></th></tr>${R.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.keys.length}</td><td>${dt(r.created)}</td><td><button data-a=pv data-id=${r.id}>Xem trước</button> <button data-a=dlr data-id=${r.id}>Tải xuống</button> <button class=del data-a=delr data-id=${r.id}>Xóa</button></td></tr>`).join('')||'<tr><td colspan=4 class=muted>Chưa có file mẫu.</td></tr>'}</table></div>
 <div class=card><h3>Sao lưu / Khôi phục</h3><div class=warn>File sao lưu chứa cả API Key dạng văn bản thường. Cất giữ cẩn thận.</div><div class=row><button class=pri id=bk>Tải file sao lưu</button><input type=file id=rf accept=".zip"><button id=rs>Khôi phục từ file</button></div></div>
 <div class=card><h3>Lịch sử xử lý</h3><table><tr><th>Thời gian</th><th>File</th><th>Thao tác</th><th>Token</th></tr>${H.slice(0,50).map(h=>`<tr><td>${dt(h.t)}</td><td>${esc(h.file)}</td><td>${esc(h.action)}${h.n!=null?' · '+h.n+' vị trí':''}</td><td>${h.tin!=null?h.tin+'+'+h.tout+(h.cost!=null?' (~$'+h.cost.toFixed(4)+')':''):''}</td></tr>`).join('')||'<tr><td colspan=4 class=muted>Chưa có lịch sử.</td></tr>'}</table></div>`;
 $('#bk').onclick=backup;$('#rs').onclick=restore;
 $('#main').onclick=async e=>{const b=e.target.closest('button[data-a]');if(!b)return;const id=b.dataset.id,a=b.dataset.a;
  if(a==='pv')preview(id);else if(a==='dlr'){const o=await dbGet('results',id);dl(o.data,o.name)}else if(a==='dlo'){const o=await dbGet('files',id);dl(o.data,o.name)}
  else if(a==='info'){const o=await dbGet('files',id);modal(`<h3>${esc(o.name)}</h3><p>Hash SHA-256: <code>${o.id}</code><br>Phiên bản: v${o.version} · ${fmt(o.size)} · nạp lúc ${dt(o.added)}<br>Số vị trí Key: ${o.analysis?o.analysis.length:'chưa phân tích'}${o.usage?`<br>Token: ${o.usage.tin} vào / ${o.usage.tout} ra`:''}</p>`)}
  else if(confirm('Xóa vĩnh viễn mục này?')){if(a==='del'){await dbDel('files',id);await dbDel('results',id);sess=sess.filter(x=>x!==id)}else await dbDel('results',id);library()}}}
async function backup(){const F=await dbAll('files'),R=await dbAll('results'),S=await dbAll('settings'),z=new JSZip();
 z.file('manifest.json',JSON.stringify({app:'hopdong-keygen',version:1,created:Date.now(),files:F.map(({data,...m})=>m),results:R.map(({data,...m})=>m),settings:S}));
 F.forEach(f=>z.file('files/'+f.id,f.data));R.forEach(r=>z.file('results/'+r.id,r.data));
 dl(await z.generateAsync({type:'blob',compression:'DEFLATE'}),`sao-luu-hopdong-${new Date().toISOString().slice(0,10)}.zip`);toast('Đã tạo file sao lưu.')}
async function restore(){const f=$('#rf').files[0];if(!f)return toast('Chọn file sao lưu trước.',1);
 try{const z=await JSZip.loadAsync(f),mf=z.file('manifest.json');if(!mf)throw new Error('Thiếu manifest.json');const m=JSON.parse(await mf.async('string'));
  if(m.app!=='hopdong-keygen'||m.version!==1||!Array.isArray(m.files)||!Array.isArray(m.results)||!Array.isArray(m.settings))throw new Error('Không phải file sao lưu hợp lệ của ứng dụng này');
  const F=[],R=[];for(const x of m.files){const e=z.file('files/'+x.id);if(!e)throw new Error('Thiếu dữ liệu file '+x.name);const data=await e.async('arraybuffer');if(await sha(data)!==x.id)throw new Error('Hash không khớp: '+x.name);F.push({...x,data})}
  for(const x of m.results){const e=z.file('results/'+x.id);if(!e)throw new Error('Thiếu file mẫu '+x.name);R.push({...x,data:await e.async('arraybuffer')})}
  if(!confirm(`Khôi phục ${F.length} file gốc, ${R.length} file mẫu và cấu hình? Dữ liệu hiện tại sẽ được thay thế.`))return;
  const t=db.transaction(STORES,'readwrite');STORES.forEach(s=>t.objectStore(s).clear());F.forEach(x=>t.objectStore('files').put(x));R.forEach(x=>t.objectStore('results').put(x));m.settings.forEach(x=>t.objectStore('settings').put(x));
  await new Promise((ok,no)=>{t.oncomplete=ok;t.onerror=t.onabort=()=>no(t.error||new Error('Ghi dữ liệu thất bại'))});sess=[];toast('Khôi phục thành công.');library()}
 catch(e){toast('Khôi phục thất bại, dữ liệu hiện tại được giữ nguyên: '+e.message,1)}}
async function aiPage(){$('#main').innerHTML=`<h2>Cấu hình AI</h2><div class=tabs><a data-t=keys class="${tab==='keys'?'on':''}">API Key</a><a data-t=prompt class="${tab==='prompt'?'on':''}">Prompt</a></div><div id=tb></div>`;
 document.querySelector('.tabs').onclick=e=>{if(e.target.dataset.t){tab=e.target.dataset.t;aiPage()}};
 if(tab==='prompt'){$('#tb').innerHTML=`<div class=card><textarea id=pt rows=22>${esc(await getSet('prompt',DEFAULT_PROMPT))}</textarea><div class=row><button class=pri id=ps>Lưu Prompt</button><button id=pr>Khôi phục mặc định</button></div><p class=muted>Prompt phải yêu cầu AI trả JSON dạng {"fields":[{key,before,original}]}, nếu không ứng dụng không đọc được kết quả.</p></div>`;
  $('#ps').onclick=async()=>{await setSet('prompt',$('#pt').value);toast('Đã lưu Prompt.')};$('#pr').onclick=async()=>{await setSet('prompt',DEFAULT_PROMPT);aiPage()};return}
 const ks=await keys(),act=await getSet('activeKey',null);
 $('#tb').innerHTML=`<div class=warn><b>Cảnh báo bảo mật:</b> API Key được lưu dạng văn bản thường trong IndexedDB của trình duyệt này và nằm trong file sao lưu. Không dùng trên máy công cộng; nên dùng key có hạn mức thấp và thu hồi khi không cần.</div>
 <div class=card><table><tr><th>Tên</th><th>Nhà cung cấp / Model</th><th>Key</th><th>Token / ghi chú</th><th></th></tr>${ks.map(k=>`<tr><td>${esc(k.name)}${k.id===act?' <b class=ok>(đang dùng)</b>':''}</td><td>${esc(k.provider)} / ${esc(k.model)}</td><td>${esc(k.key.slice(0,4))}••••${esc(k.key.slice(-3))}</td><td>Đã dùng: ${k.used||0}${k.quota?'<br>'+esc(k.quota):''}${k.note?'<br>'+esc(k.note):''}</td><td><button data-a=use data-id=${k.id}>Dùng</button> <button data-a=ed data-id=${k.id}>Sửa</button> <button class=del data-a=rm data-id=${k.id}>Xóa</button></td></tr>`).join('')||'<tr><td colspan=5 class=muted>Chưa có API Key.</td></tr>'}</table></div>
 <div class=card><h3 id=fh>Thêm API Key</h3><input type=hidden id=kid><div class=row><input id=kn placeholder="Tên gợi nhớ (vd: Gemini free #1)"><select id=kp><option value=gemini>Google Gemini</option><option value=openai>OpenAI / tương thích</option><option value=anthropic>Anthropic</option></select><input id=km placeholder="Model (vd: gemini-2.5-flash)"></div>
 <div class=row><input id=kk type=password placeholder="API Key" size=40><input id=ku placeholder="Base URL (tuỳ chọn)" size=34></div><div class=row><input id=ko placeholder="Ghi chú % token / thời gian hồi" size=40><input id=ki type=number step=any placeholder="Giá $/1M token vào" style="width:150px"><input id=kt type=number step=any placeholder="Giá $/1M token ra" style="width:150px"></div><button class=pri id=sv>Lưu</button></div>`;
 const g=id=>ks.find(k=>k.id===id);
 $('#tb').onclick=async e=>{const b=e.target.closest('button[data-a]');if(!b)return;const id=b.dataset.id;
  if(b.dataset.a==='use'){await setSet('activeKey',id);aiPage()}else if(b.dataset.a==='rm'){if(confirm('Xóa API Key này?')){await setSet('keys',ks.filter(k=>k.id!==id));if(act===id)await setSet('activeKey',null);aiPage()}}
  else{const k=g(id);$('#fh').textContent='Sửa API Key';$('#kid').value=id;$('#kn').value=k.name;$('#kp').value=k.provider;$('#km').value=k.model;$('#kk').value=k.key;$('#ku').value=k.baseUrl||'';$('#ko').value=k.note||'';$('#ki').value=k.pin||'';$('#kt').value=k.pout||''}};
 $('#sv').onclick=async()=>{const o={id:$('#kid').value||crypto.randomUUID(),name:$('#kn').value.trim(),provider:$('#kp').value,model:$('#km').value.trim(),key:$('#kk').value.trim(),baseUrl:$('#ku').value.trim(),note:$('#ko').value.trim(),pin:+$('#ki').value||0,pout:+$('#kt').value||0};
  if(!o.name||!o.model||!o.key)return toast('Cần nhập tên, model và API Key.',1);const i=ks.findIndex(k=>k.id===o.id);if(i>=0)ks[i]={...ks[i],...o};else ks.push(o);await setSet('keys',ks);if(!act)await setSet('activeKey',o.id);toast('Đã lưu API Key.');aiPage()}}
const PAGES={home,process:processPage,library,ai:aiPage};
const route=()=>{const p=(location.hash||'#home').slice(1);document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.dataset.p===p));(PAGES[p]||home)()};
addEventListener('hashchange',route);
openDB().then(d=>{db=d;route()}).catch(e=>{$('#main').innerHTML='<div class=warn>Không mở được IndexedDB: '+esc(e.message)+'</div>'});
