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
/* ---------- Xử lý docx/xlsx (hoàn toàn bằng code) ---------- */
async function loadParts(buf,ext){const zip=await JSZip.loadAsync(buf);const re=ext==='docx'?/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/:/^xl\/sharedStrings\.xml$/;
 const parts=[];for(const n of Object.keys(zip.files).filter(n=>re.test(n))){const doc=new DOMParser().parseFromString(await zip.file(n).async('string'),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('XML lỗi: '+n);parts.push({name:n,doc})}
 if(!parts.length)throw new Error('File không đúng cấu trúc '+ext);return{zip,parts}}
const xml=d=>{const s=new XMLSerializer().serializeToString(d);return s.startsWith('<?xml')?s:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+s};
/* ---------- AI ---------- */
const dur=x=>{let ms=0;for(const[,v,u]of String(x).matchAll(/([\d.]+)(ms|h|m|s)/g))ms+=+v*{ms:1,s:1e3,m:6e4,h:36e5}[u];return ms};
const quota=h=>{const g=(...n)=>n.map(x=>h.get(x)).find(Boolean),r=+g('x-ratelimit-remaining-tokens','anthropic-ratelimit-tokens-remaining'),l=+g('x-ratelimit-limit-tokens','anthropic-ratelimit-tokens-limit'),t=g('x-ratelimit-reset-tokens','anthropic-ratelimit-tokens-reset');
 if(!(l>0)||isNaN(r))return null;return{used:Math.max(0,Math.min(100,Math.round((1-r/l)*100))),resetAt:t?(/^\d{4}-/.test(t)?Date.parse(t):dur(t)?Date.now()+dur(t):null):null,at:Date.now()}};
const ERR={401:'Sai API Key hoặc không có quyền truy cập',403:'API Key bị từ chối hoặc bị chặn khu vực',404:'Sai model hoặc endpoint (Base URL)',429:'Hết quota hoặc vượt giới hạn tốc độ'};
const AH=k=>({'x-api-key':k.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'});
async function callAI(k,prompt,text,o={}){const P=PROVIDERS[k.provider]||PROVIDERS.openai,base=(k.baseUrl||P.base).replace(/\/$/,''),J=o.json!==false;let url,hd={},body,pick;
 if(P.type==='gemini'){url=`${base}/models/${k.model}:generateContent?key=${encodeURIComponent(k.key)}`;body={contents:[{parts:[{text:prompt+'\n\n=== VĂN BẢN ===\n'+text}]}],generationConfig:{...(J?{responseMimeType:'application/json'}:{}),temperature:0}};
  pick=j=>[j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')||'',j.usageMetadata?.promptTokenCount||0,j.usageMetadata?.candidatesTokenCount||0]}
 else if(P.type==='anthropic'){url=base+'/messages';hd=AH(k);body={model:k.model,max_tokens:o.json===false?50:16000,temperature:0,system:prompt,messages:[{role:'user',content:text}]};
  pick=j=>[j.content?.map(c=>c.text||'').join('')||'',j.usage?.input_tokens||0,j.usage?.output_tokens||0]}
 else{hd={Authorization:'Bearer '+k.key};body={model:k.model,temperature:0,...(J?{response_format:{type:'json_object'}}:{}),messages:[{role:'system',content:prompt},{role:'user',content:text}]};
  if(P.type==='cohere'){url=base+'/v2/chat';pick=j=>[j.message?.content?.map(c=>c.text||'').join('')||'',j.usage?.tokens?.input_tokens||0,j.usage?.tokens?.output_tokens||0]}
  else{url=base+'/chat/completions';pick=j=>[j.choices?.[0]?.message?.content||'',j.usage?.prompt_tokens||0,j.usage?.completion_tokens||0]}}
 let err;for(let a=1;a<=(o.tries||3);a++){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...hd},body:JSON.stringify(body)});
  if(r.ok){const raw=await r.text();let j;try{j=JSON.parse(raw)}catch{err=Object.assign(new Error('API trả về phản hồi rỗng hoặc không hợp lệ'+(raw?': '+raw.slice(0,120):'')),{empty:1});await new Promise(s=>setTimeout(s,1000));continue}
  const[t,tin,tout]=pick(j),cut=[j.choices?.[0]?.finish_reason==='length',j.candidates?.[0]?.finishReason==='MAX_TOKENS',j.stop_reason==='max_tokens',j.finish_reason==='MAX_TOKENS'].some(Boolean);return{text:t,tin,tout,cut,quota:quota(r.headers)}}
  const tx=await r.text();if(r.status===400&&body.response_format){delete body.response_format;a--;continue}
  err=Object.assign(new Error(`${ERR[r.status]||'Lỗi API'} (HTTP ${r.status}): ${tx.slice(0,200)}`),{fatal:r.status!==429&&r.status<500});if(err.fatal)throw err}
  catch(e){if(e.fatal)throw e;err=err||(e instanceof TypeError?new Error('Lỗi kết nối hoặc bị chặn CORS: '+e.message):e)}
  await new Promise(s=>setTimeout(s,1500*a*a))}
 throw err}
async function listModels(k){const P=PROVIDERS[k.provider],base=(k.baseUrl||P.base).replace(/\/$/,'');let url=base+'/models',hd={Authorization:'Bearer '+k.key};
 if(P.type==='gemini'){url+='?key='+encodeURIComponent(k.key);hd={}}else if(P.type==='anthropic')hd=AH(k);else if(P.type==='cohere')url=base+'/v1/models';
 const r=await fetch(url,{headers:hd});if(!r.ok)throw new Error(`${ERR[r.status]||'Lỗi'} (HTTP ${r.status})`);const j=await r.json();
 return(j.data||j.models||[]).map(m=>(m.id||m.name||'').replace(/^models\//,'')).filter(Boolean)}
function jparse(t){t=String(t||'').replace(/^```(?:json)?|```$/gm,'').trim();if(!t)throw new SyntaxError('Phản hồi rỗng');
 try{return JSON.parse(t)}catch(e){const i=t.indexOf('[');if(i<0)throw e;const out=[];let d=0,s=-1,q=false,x=false;
  for(let p=i+1;p<t.length;p++){const ch=t[p];if(q){if(x)x=false;else if(ch==='\\')x=true;else if(ch==='"')q=false;continue}
   if(ch==='"')q=true;else if(ch==='{'){if(!d)s=p;d++}else if(ch==='}'&&d&&!--d){try{out.push(JSON.parse(t.slice(s,p+1)))}catch{}}}
  if(!out.length)throw e;return out}}
function parseFields(t){const o=jparse(t);return(Array.isArray(o)?o:o.fields||[]).map(f=>{const c=+f.confidence,S=x=>String(x||''),ty=['fixed','uncertain'].includes(f.type)?f.type:'dynamic',ref=parseInt(S(f.ref).replace(/\D/g,''));
 return{ref:isNaN(ref)?null:ref,key:S(f.key).replace(/[^A-Za-z0-9_]/g,''),name:S(f.field_name),type:ty,before:S(f.before),original:S(f.original),after:S(f.after),context:S(f.context),reason:S(f.reason),confidence:isNaN(c)?1:c,on:ty==='dynamic'&&(isNaN(c)||c>=0.7)}}).filter(f=>f.ref!=null||f.original)}
const getPrompt=async()=>(await getSet('promptV',0))===3?getSet('prompt',DEFAULT_PROMPT):DEFAULT_PROMPT;
const keys=()=>getSet('keys',[]);
async function activeKey(){const id=await getSet('activeKey',null);return(await keys()).find(k=>k.id===id)}
const cleanKey=x=>String(x||'').replace(/[^A-Za-z0-9_]/g,'');
const parseSlots=t=>{const o=jparse(t);return(Array.isArray(o)?o:o.slots||[]).map(i=>({...i,slot:String(i.slot||'').replace(/[^\d.]/g,'')}))};
/* Gửi theo từng đoạn nhỏ; nếu AI trả rỗng, JSON lỗi hoặc bị cắt do hết giới hạn đầu ra thì tự chia đôi đoạn đó và gửi lại. */
async function ask(k,ls,prompt,parse){const T={all:[],tin:0,tout:0,q:null};
 const run=async arr=>{let r,res=null;try{r=await callAI(k,prompt,arr.join('\n'));T.tin+=r.tin;T.tout+=r.tout;T.q=r.quota||T.q;res=parse(r.text)}catch(e){if(!(e instanceof SyntaxError)&&!e.empty)throw e}
  if(res&&!r?.cut){T.all.push(...res);return}
  if(arr.length>1){const h=arr.length>>1;await run(arr.slice(0,h));await run(arr.slice(h));return}
  if(res){T.all.push(...res);return}
  throw new Error('AI trả về phản hồi rỗng hoặc không phải JSON hợp lệ. Hãy dùng model khác (tránh model "reasoning/thinking"), dùng "Kiểm tra tương thích model" trong Cấu hình AI để chọn model phù hợp.')};
 let ch=[],c=[],n=0;for(const l of ls){if(n+l.length>6000&&c.length){ch.push(c);c=[];n=0}c.push(l);n+=l.length}if(c.length)ch.push(c);
 for(const x of ch)await run(x);return{all:T.all,tin:T.tin,tout:T.tout,q:T.q}}
function coverage(rec,S){const refs=new Set(rec.analysis.map(f=>f.ref));rec.cand=S.filter(s=>s.cand.length).length;rec.uncov=S.filter(s=>!refs.has(s.id)&&s.cand.some(c=>c!=='sau dấu hai chấm')).map(s=>({id:s.id,where:s.where,text:s.text.trim().slice(0,100)}))}
async function account(k,rec,r,act){const u=rec.usage||{tin:0,tout:0};u.tin+=r.tin;u.tout+=r.tout;u.cost=k.pin||k.pout?(u.tin*(k.pin||0)+u.tout*(k.pout||0))/1e6:null;rec.usage=u;await dbPut('files',rec);
 const ks=await keys(),kk=ks.find(x=>x.id===k.id);kk.used=(kk.used||0)+r.tin+r.tout;if(r.q)kk.q=r.q;await setSet('keys',ks);await log({t:Date.now(),file:rec.name,action:act+' ('+k.name+')',mode:rec.mode||2,st:'Thành công',tin:r.tin,tout:r.tout,cost:u.cost,n:rec.analysis.length})}
/* Mỗi file giữ kết quả phân tích riêng cho từng chế độ; đổi chế độ không làm mất kết quả cũ và không gọi lại AI nếu đã có. */
async function useMode(rec,m){const cm=rec.mode||2;if(cm===m&&rec.analysis)return true;rec.store=rec.store||{};
 if(rec.analysis)rec.store[cm]={analysis:rec.analysis,uncov:rec.uncov,cand:rec.cand,usage:rec.usage,left:rec.left};
 const st=rec.store[m];rec.mode=m;rec.err='';if(st){Object.assign(rec,st);delete rec.store[m]}else{rec.analysis=null;rec.uncov=null;rec.cand=null;rec.left=null;rec.usage=null}
 await dbPut('files',rec);return!!rec.analysis}
async function analyze(rec,mode){const k=await activeKey();if(!k)throw new Error('Chưa chọn API Key trong trang Cấu hình AI.');
 const{parts}=await loadParts(rec.data,rec.ext),S=Core.segs(parts,rec.ext);let r;rec.mode=mode;
 if(mode===1){const sl=Core.slots(S);if(!sl.length)throw new Error('Không tìm thấy dấu ba chấm (...) nào trong file. Hãy thêm dấu ... vào các vị trí cần tạo key rồi nạp lại, hoặc dùng Chế độ 2.');
  r=await ask(k,Core.slotLines(S,sl),await getSet('promptDots',DEFAULT_PROMPT_DOTS),parseSlots);
  rec.analysis=sl.map(x=>{const it=r.all.find(i=>i.slot===x.sid),key=cleanKey(it?.key),c=+it?.confidence;return{ref:x.ref,slot:1,st:x.st,en:x.en,key,name:String(it?.field_name||''),type:key?'dynamic':it?'fixed':'uncertain',before:x.before,original:x.text,after:x.after,context:x.ctx,reason:String(it?.reason||(it?'':'AI không trả về kết quả cho vị trí này')),confidence:isNaN(c)?1:c,on:!!key&&(isNaN(c)||c>=0.7)}});rec.cand=sl.length;rec.uncov=[]}
 else{r=await ask(k,Core.lines(S),await getPrompt(),parseFields);rec.analysis=r.all;coverage(rec,S)}
 rec.left=null;rec.usage=null;await account(k,rec,r,'Phân tích AI')}
async function recheck(rec){const k=await activeKey();if(!k)throw new Error('Chưa chọn API Key.');const{parts}=await loadParts(rec.data,rec.ext),S=Core.segs(parts,rec.ext),ids=new Set();
 rec.uncov.forEach(u=>[u.id-1,u.id,u.id+1].forEach(i=>ids.add(i)));const r=await ask(k,Core.lines(S,ids),await getPrompt(),parseFields);rec.analysis.push(...r.all);coverage(rec,S);await account(k,rec,r,'Hỏi lại ứng viên sót')}
async function log(e){const h=await getSet('history',[]);h.unshift(e);await setSet('history',h.slice(0,200))}
async function build(rec){const{zip,parts}=await loadParts(rec.data,rec.ext),fields=rec.analysis;
 Core.execute(Core.plan(Core.segs(parts,rec.ext),fields));
 parts.forEach(p=>zip.file(p.name,xml(p.doc)));const data=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
 rec.left=Core.verify(Core.segs(parts,rec.ext));await dbPut('files',rec);
 await dbPut('results',{id:rec.id,name:rec.name.replace(/(\.\w+)$/,'_mau$1'),data,created:Date.now(),keys:[...new Set(fields.filter(f=>f.hits).map(f=>f.key))]});
 await log({t:Date.now(),file:rec.name,action:'Chèn Key',mode:rec.mode||2,st:'Thành công',n:fields.filter(f=>f.hits).length});return fields.filter(f=>f.on!==false&&!f.hits&&!f.blocked)}
async function preview(id){const r=await dbGet('results',id),ext=r.name.split('.').pop().toLowerCase(),{parts}=await loadParts(r.data,ext);
 modal(`<h3>Xem trước (văn bản) – ${esc(r.name)}</h3><p class=muted>Hiển thị nội dung văn bản; định dạng gốc được giữ trong file tải về.</p><pre>${esc(Core.segs(parts,ext).map(s=>s.text.trim()).join('\n')).replace(/\{\{\w+\}\}/g,m=>'<mark>'+m+'</mark>')}</pre>`)}
/* ---------- Trang ---------- */
let sess=[],cur=null,tab='keys';
async function home(){const[f,r]=[await dbAll('files'),await dbAll('results')];$('#main').innerHTML=`<h2>Trang chủ</h2><div class=card><b>${f.length}</b> file gốc · <b>${r.length}</b> file mẫu đã tạo trong thư viện trên trình duyệt này.</div>
<div class=card><h3>Hướng dẫn sử dụng</h3><ol><li><b>Thêm và cấu hình API Key</b> – vào <a href="#ai">Cấu hình AI</a>, chọn nhà cung cấp, nhập tên gợi nhớ, model ID và API Key rồi bấm <b>Lưu</b>. Bấm <b>Dùng</b> để chọn key đang hoạt động.</li>
<li><b>Kiểm tra kết nối AI</b> – bấm <b>Kiểm tra</b> ở dòng API Key (hoặc <b>Kiểm tra kết nối</b> trong form). Lỗi sai key, sai model, hết quota hoặc lỗi mạng sẽ được báo rõ.</li>
<li><b>Tải file lên</b> – vào <a href="#process">Xử lý file</a>, chọn một hoặc nhiều file .docx (.xlsx chỉ xử lý được chuỗi dùng chung). File được lưu vào <a href="#library">Thư viện</a>; file trùng nội dung được nhận diện bằng mã hash.</li>
<li><b>Chọn chế độ xử lý</b> – hai chế độ nằm ngay trên nút phân tích:<br><b>Chế độ 1 – Chèn key tại dấu ba chấm (mặc định):</b> chỉ các vị trí có <code>...</code> (hoặc <code>…</code>) mới được tạo key; AI chỉ xác định ý nghĩa và đề xuất tên key. <b>Trước khi nạp file, bạn cần mở Word và thêm dấu <code>...</code> vào mọi vị trí muốn tạo key.</b> Cụm <code>ngày ... tháng ... năm ...</code> luôn chỉ ra một key. Chế độ này cho kết quả chính xác và do bạn kiểm soát vị trí.<br><b>Chế độ 2 – AI tự phân tích:</b> không cần dấu <code>...</code>, AI tự tìm trường dữ liệu trong toàn bộ tài liệu nhưng có thể bỏ sót hoặc nhận diện sai.</li>
<li><b>Phân tích và tạo key</b> – bấm <b>Phân tích bằng AI</b>. File đã có kết quả cùng chế độ sẽ không gọi AI lại.</li>
<li><b>Kiểm tra, chỉnh sửa, xác nhận key</b> – bấm <b>Xem/Sửa Key</b>: bỏ chọn mục không cần, sửa tên key (đặt trùng tên để gộp), xóa dòng, bấm mã <b>P&lt;số&gt;</b> để xem vị trí trong tài liệu.</li>
<li><b>Xuất file</b> – bấm <b>Chèn Key &amp; tạo file mẫu</b>, rồi <b>Xem trước</b> và <b>Tải mẫu</b>. File gốc không bị ghi đè.</li>
<li><b>Sao lưu và khôi phục</b> – ở đầu trang Thư viện. Sao lưu tạo file .zip (có cả API Key). Khôi phục có hai cách: <b>Thay thế toàn bộ</b> hoặc <b>Gộp</b> vào dữ liệu hiện tại (bỏ qua mục trùng).</li></ol></div>`}
async function processPage(){const mode=await getSet('mode',1);$('#main').innerHTML=`<h2>Xử lý file</h2><div class=card><b>Chế độ xử lý</b>
<label class=md><input type=radio name=md value=1 ${mode===1?'checked':''}> <b>Chế độ 1 – Chèn key tại dấu ba chấm (mặc định)</b><br><span class=muted>Chỉ thay các vị trí có <code>...</code>; AI chỉ xác định ý nghĩa và đề xuất key. Ngày tháng năm gom thành một key. Hãy thêm <code>...</code> vào file Word trước khi nạp.</span></label>
<label class=md><input type=radio name=md value=2 ${mode===2?'checked':''}> <b>Chế độ 2 – AI tự phân tích và chèn key</b><br><span class=muted>Không cần dấu <code>...</code>. AI tự tìm trường dữ liệu nhưng có thể bỏ sót hoặc nhận diện sai; cần rà soát kết quả.</span></label></div>
<div class=card><div class=row><input type=file id=fi multiple accept=".docx,.xlsx"><button class=pri id=bAn>Phân tích bằng AI</button></div><div id=ak class=muted></div></div><div id=lst></div><div id=rev></div>`;
 const k=await activeKey();$('#ak').textContent=k?`Đang dùng API Key: ${k.name} (${PROVIDERS[k.provider]?.name||k.provider}/${k.model})`:'Chưa chọn API Key – vào Cấu hình AI.';
 $('#fi').onchange=async e=>{for(const f of e.target.files){const ext=f.name.split('.').pop().toLowerCase();if(!['docx','xlsx'].includes(ext)){toast(`Bỏ qua ${f.name}: chỉ hỗ trợ .docx/.xlsx`,1);continue}
  const data=await f.arrayBuffer(),id=await sha(data);if(!await dbGet('files',id)){const n=(await dbAll('files')).filter(x=>x.name===f.name).length;await dbPut('files',{id,name:f.name,ext,size:f.size,data,added:Date.now(),version:n+1,analysis:null})}
  else toast(`${f.name}: file trùng nội dung, dùng lại dữ liệu đã lưu`);if(!sess.includes(id))sess.push(id)}e.target.value='';list()};
 $('#bAn').onclick=async()=>{const m=+document.querySelector('input[name=md]:checked').value;await setSet('mode',m);$('#bAn').disabled=true;
  for(const id of sess){const rec=await dbGet('files',id);if(await useMode(rec,m))continue;
   try{$('#lst').dataset.busy=id;await list(id);await analyze(rec,m)}catch(e){rec.err=e.message;await dbPut('files',rec);await log({t:Date.now(),file:rec.name,action:'Phân tích AI',mode:m,st:'Lỗi: '+e.message.slice(0,120)});toast(rec.name+': '+e.message,1)}}
  $('#lst').dataset.busy='';$('#bAn').disabled=false;list()};list()}
async function list(busy){let h='<div class=card><table><tr><th>File</th><th>Trạng thái</th><th></th></tr>';
 for(const id of sess){const r=await dbGet('files',id),o=await dbGet('results',id);if(!r)continue;
  const st=busy===id?'Đang phân tích…':r.err?`<span class=err>${esc(r.err)}</span>`:o?'<span class=ok>Đã tạo mẫu (dùng kết quả đã lưu)</span>':r.analysis?`Đã phân tích (chế độ ${r.mode||2}): ${r.analysis.length} trường${r.cand!=null?` · ${r.cand} ${r.mode===1?'vị trí dấu ba chấm':'đoạn ứng viên'}`:''}${r.usage?` · ${r.usage.tin}+${r.usage.tout} token`+(r.usage.cost!=null?` · ~$${r.usage.cost.toFixed(4)}`:''):''}`:'Chưa phân tích';
  h+=`<tr><td>${esc(r.name)}<br><span class=muted>v${r.version} · ${fmt(r.size)}</span></td><td>${st}</td><td>${r.analysis?`<button data-a=rev data-id=${id}>Xem/Sửa Key</button> `:''}${o?`<button data-a=pv data-id=${id}>Xem trước</button> <button data-a=dl data-id=${id}>Tải mẫu</button>`:''}</td></tr>`}
 $('#lst').innerHTML=h+(sess.length?'':'<tr><td colspan=3 class=muted>Chưa chọn file nào.</td></tr>')+'</table></div>';
 $('#lst').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.id;if(b.dataset.a==='pv')preview(id);else if(b.dataset.a==='dl'){const o=await dbGet('results',id);dl(o.data,o.name)}else{cur=await dbGet('files',id);review()}}}
let flt='all';
async function showLoc(i){const f=cur.analysis[i],{parts}=await loadParts(cur.data,cur.ext),S=Core.segs(parts,cur.ext);let s=S[f.ref],r=s&&Core.find(s,f,[]);
 if(!r)for(const t of S){r=Core.find(t,f,[],true);if(r){s=t;break}}if(!s)return toast('Không xác định được vị trí trong tài liệu gốc.',1);
 modal('<h3>Vị trí trong tài liệu gốc</h3>'+S.slice(Math.max(0,s.id-2),s.id+3).map(x=>`<p${x.id===s.id?' style="background:#eef4ff;padding:4px"':''}><span class=muted>P${x.id} · ${esc(x.where)}</span><br>${x.id===s.id&&r?esc(x.text.slice(0,r.st))+'<mark>'+esc(x.text.slice(r.st,r.en))+'</mark>'+esc(x.text.slice(r.en)):esc(x.text)||'(trống)'}</p>`).join(''))}
function review(){const f=cur.analysis,c=t=>f.filter(x=>x.type===t).length,rows=f.map((x,i)=>[x,i]).filter(([x])=>flt==='all'||x.type===flt),TL={dynamic:'Động',fixed:'Cố định',uncertain:'Chưa chắc chắn'};
 $('#rev').innerHTML=`<div class=card><h3>Kết quả phân tích – ${esc(cur.name)} (Chế độ ${cur.mode||2})</h3>${cur.mode===1?'':'<p class=warn>Chế độ 2 do AI tự phân tích nên có thể bỏ sót hoặc nhận diện sai trường. Hãy rà soát danh sách trước khi chèn Key.</p>'}<p>Tổng <b>${f.length}</b> trường: <b>${c('dynamic')}</b> động · <b>${c('fixed')}</b> cố định · <b>${c('uncertain')}</b> chưa chắc chắn${cur.cand!=null?`${cur.mode===1?` · ${cur.cand} vị trí dấu ba chấm`:` · hệ thống đánh dấu ${cur.cand} đoạn ứng viên`}`:''}</p><p class=muted>Chỉ các dòng được chọn mới được thay. Mục cố định/chưa chắc chắn/tin cậy dưới 70% mặc định chưa chọn. Đặt tên Key trùng để gộp.</p>
 <div class=row>Lọc loại: <select id=fl>${[['all','Tất cả'],['dynamic','Động'],['fixed','Cố định'],['uncertain','Chưa chắc chắn']].map(([v,l])=>`<option value=${v}${flt===v?' selected':''}>${l}</option>`).join('')}</select></div>
 <table><tr><th></th><th>Key</th><th>Tên trường</th><th>Vị trí (nhãn / <mark>thay thế</mark> / giữ lại)</th><th>Loại</th><th>Tin cậy</th><th>Kết quả</th><th></th></tr>${rows.map(([x,i])=>`<tr${x.on===false?' class=muted':''}><td><input type=checkbox data-c=${i} ${x.on===false?'':'checked'}></td><td><input data-i=${i} value="${esc(x.key)}" size=18></td><td title="${esc(x.reason)}">${esc(x.name)}</td><td>${x.ref!=null?`<a href="#" data-v=${i}>P${x.ref}</a> `:''}${esc(x.before)}<mark>${esc(x.original)}</mark>${esc(x.after)}</td><td>${TL[x.type]}</td><td>${Math.round((x.confidence??1)*100)}%</td><td>${x.blocked?`<span class=err>Bỏ qua: ${esc(x.blocked)}</span>`:x.note?`<span class=err>${esc(x.note)}</span>`:x.hits==null||x.on===false?'':x.hits?'<span class=ok>Đã thay</span>':''}</td><td><button class=del data-d=${i}>Xóa</button></td></tr>`).join('')}</table></div>
 ${cur.uncov?.length?`<div class=card><h3>${cur.uncov.length} đoạn ứng viên chưa có trường nào</h3><ul>${cur.uncov.slice(0,20).map(u=>`<li><span class=muted>P${u.id} · ${esc(u.where)}</span> ${esc(u.text)||'(trống)'}</li>`).join('')}</ul><button id=rc>Hỏi lại AI về các đoạn này</button></div>`:''}
 ${cur.left?.length?`<div class=card><h3>Còn dấu chấm/gạch chưa thay (${cur.left.length} đoạn)</h3><ul>${cur.left.slice(0,30).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:cur.left?'<p class=ok>Không còn đoạn nào có dấu chấm/gạch trống.</p>':''}<button class=pri id=bb>Chèn Key &amp; tạo file mẫu</button>`;
 $('#rev').oninput=e=>{if(e.target.dataset.i!=null)f[e.target.dataset.i].key=e.target.value.replace(/[^A-Za-z0-9_]/g,'')};
 $('#rev').onchange=e=>{if(e.target.dataset.c!=null)f[e.target.dataset.c].on=e.target.checked;if(e.target.id==='fl'){flt=e.target.value;review()}};
 $('#rev').onclick=async e=>{const d=e.target.dataset;if(d.v!=null){e.preventDefault();showLoc(+d.v)}if(d.d!=null){f.splice(+d.d,1);review()}
  if(e.target.id==='rc'){try{e.target.disabled=true;await recheck(cur);review();list()}catch(er){toast('Lỗi: '+er.message,1);review()}}
  if(e.target.id==='bb'){try{const miss=await build(cur);toast(miss.length?`Xong. ${miss.length} mục cần kiểm tra (xem cột Kết quả).`:'Đã tạo file mẫu.',miss.length);review();list()}catch(er){toast('Lỗi: '+er.message,1)}}}}
async function histOpen(){let H=await getSet('history',[]);if(H.some(h=>!h.hid)){H=H.map(h=>h.hid?h:{...h,hid:crypto.randomUUID()});await setSet('history',H)}
 modal(`<h3>Lịch sử xử lý</h3><p class=muted>Xóa lịch sử không ảnh hưởng đến file trong thư viện.</p><div class=row>Từ ngày <input type=date id=hf> đến <input type=date id=ht> <button id=hx>Bỏ lọc</button> <button class=del id=hdf>Xóa các mục đang hiển thị</button> <button class=del id=hda>Xóa toàn bộ lịch sử</button></div><div id=hl></div>`);
 const ov=document.querySelector('.ov'),ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const view=()=>{const a=$('#hf').value,b=$('#ht').value;return H.filter(h=>(!a||ymd(h.t)>=a)&&(!b||ymd(h.t)<=b))};
 const draw=()=>{const g={};view().forEach(h=>(g[ymd(h.t)]??=[]).push(h));$('#hl').innerHTML=Object.keys(g).sort().reverse().map(d=>`<div class=hg>${d.split('-').reverse().join('/')} · ${g[d].length} mục</div><table>${g[d].map(h=>`<tr><td>${new Date(h.t).toLocaleTimeString('vi-VN')}</td><td>${esc(h.file)}</td><td>${esc(h.action)}${h.n!=null?' · '+h.n+' vị trí':''}</td><td>${h.mode?'Chế độ '+h.mode:'—'}</td><td>${esc(h.st||'Thành công')}${h.tin!=null?' · '+h.tin+'+'+h.tout+' token':''}</td><td><button class=del data-h=${h.hid}>Xóa</button></td></tr>`).join('')}</table>`).join('')||'<p class=muted>Không có lịch sử.</p>'};
 const save=async n=>{H=n;await setSet('history',H);draw()};draw();ov.addEventListener('input',draw);
 ov.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.h)save(H.filter(h=>h.hid!==b.dataset.h));
  else if(b.id==='hx'){$('#hf').value=$('#ht').value='';draw()}
  else if(b.id==='hdf'){const v=view();if(v.length&&confirm(`Xóa ${v.length} mục lịch sử đang hiển thị?`)){const s=new Set(v.map(h=>h.hid));save(H.filter(h=>!s.has(h.hid)))}}
  else if(b.id==='hda'&&H.length&&confirm('Xóa TOÀN BỘ lịch sử xử lý? (File trong thư viện không bị ảnh hưởng)'))save([])})}
async function library(){const[F,R]=[await dbAll('files'),await dbAll('results')],rm=new Set(R.map(r=>r.id));
 $('#main').innerHTML=`<h2>Thư viện</h2><div class=card><h3>Sao lưu / Khôi phục</h3><div class=warn>File sao lưu chứa cả API Key dạng văn bản thường. Cất giữ cẩn thận.</div><div class=row><button class=pri id=bk>Tải file sao lưu</button><input type=file id=rf accept=".zip"><button id=rs>Khôi phục từ file</button></div></div>
 <div class=card><div class=row><h3 style="margin:0">Lịch sử xử lý</h3><button id=bh>Xem lịch sử</button></div></div>
 <div class=card><h3>File gốc</h3><table><tr><th>Tên</th><th>Phiên bản</th><th>Kích thước</th><th>Ngày nạp</th><th>Mẫu</th><th></th></tr>${F.map(f=>`<tr><td>${esc(f.name)}</td><td>v${f.version}</td><td>${fmt(f.size)}</td><td>${dt(f.added)}</td><td>${rm.has(f.id)?'Có':'Chưa'}</td><td><button data-a=info data-id=${f.id}>Thông tin</button> <button data-a=dlo data-id=${f.id}>Tải gốc</button> <button class=del data-a=del data-id=${f.id}>Xóa</button></td></tr>`).join('')||'<tr><td colspan=6 class=muted>Thư viện trống.</td></tr>'}</table></div>
 <div class=card><h3>File đã xử lý</h3><table><tr><th>Tên</th><th>Số Key</th><th>Ngày tạo</th><th></th></tr>${R.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.keys.length}</td><td>${dt(r.created)}</td><td><button data-a=pv data-id=${r.id}>Xem trước</button> <button data-a=dlr data-id=${r.id}>Tải xuống</button> <button class=del data-a=delr data-id=${r.id}>Xóa</button></td></tr>`).join('')||'<tr><td colspan=4 class=muted>Chưa có file mẫu.</td></tr>'}</table></div>`;
 $('#bk').onclick=backup;$('#rs').onclick=restore;$('#bh').onclick=histOpen;
 $('#main').onclick=async e=>{const b=e.target.closest('button[data-a]');if(!b)return;const id=b.dataset.id,a=b.dataset.a;
  if(a==='pv')preview(id);else if(a==='dlr'){const o=await dbGet('results',id);dl(o.data,o.name)}else if(a==='dlo'){const o=await dbGet('files',id);dl(o.data,o.name)}
  else if(a==='info'){const o=await dbGet('files',id);modal(`<h3>${esc(o.name)}</h3><p>Hash SHA-256: <code>${o.id}</code><br>Phiên bản: v${o.version} · ${fmt(o.size)} · nạp lúc ${dt(o.added)}<br>Số vị trí Key: ${o.analysis?o.analysis.length:'chưa phân tích'}${o.usage?`<br>Token: ${o.usage.tin} vào / ${o.usage.tout} ra`:''}</p>`)}
  else if((a==='del'||a==='delr')&&confirm('Xóa vĩnh viễn mục này?')){if(a==='del'){await dbDel('files',id);await dbDel('results',id);sess=sess.filter(x=>x!==id)}else await dbDel('results',id);library()}}}
async function backup(){const F=await dbAll('files'),R=await dbAll('results'),S=await dbAll('settings'),z=new JSZip();
 z.file('manifest.json',JSON.stringify({app:'hopdong-keygen',version:1,created:Date.now(),files:F.map(({data,...m})=>m),results:R.map(({data,...m})=>m),settings:S}));
 F.forEach(f=>z.file('files/'+f.id,f.data));R.forEach(r=>z.file('results/'+r.id,r.data));
 dl(await z.generateAsync({type:'blob',compression:'DEFLATE'}),`sao-luu-hopdong-${new Date().toISOString().slice(0,10)}.zip`);toast('Đã tạo file sao lưu.')}
const txDone=t=>new Promise((ok,no)=>{t.oncomplete=ok;t.onerror=t.onabort=()=>no(t.error||new Error('Ghi dữ liệu thất bại'))});
async function restore(){const f=$('#rf').files[0];if(!f)return toast('Chọn file sao lưu trước.',1);
 try{const z=await JSZip.loadAsync(f),mf=z.file('manifest.json');if(!mf)throw new Error('Thiếu manifest.json');const m=JSON.parse(await mf.async('string'));
  if(m.app!=='hopdong-keygen'||m.version!==1||!Array.isArray(m.files)||!Array.isArray(m.results)||!Array.isArray(m.settings))throw new Error('Không phải file sao lưu hợp lệ của ứng dụng này');
  const F=[],R=[];for(const x of m.files){const e=z.file('files/'+x.id);if(!e)throw new Error('Thiếu dữ liệu file '+x.name);const data=await e.async('arraybuffer');if(await sha(data)!==x.id)throw new Error('Hash không khớp: '+x.name);F.push({...x,data})}
  for(const x of m.results){const e=z.file('results/'+x.id);if(!e)throw new Error('Thiếu file mẫu '+x.name);R.push({...x,data:await e.async('arraybuffer')})}
  modal(`<h3>Khôi phục dữ liệu</h3><p>Bản sao lưu có <b>${F.length}</b> file gốc, <b>${R.length}</b> file mẫu. Chọn cách khôi phục:</p><p><b>Thay thế toàn bộ</b> – xóa dữ liệu hiện tại (thư viện, API Key, prompt, lịch sử) rồi nạp lại đúng như bản sao lưu.</p><p><b>Gộp vào dữ liệu hiện tại</b> – giữ dữ liệu đang có, chỉ thêm mục chưa có. Bỏ qua file trùng hash, API Key trùng (cùng nhà cung cấp và key), lịch sử trùng; prompt và cấu hình hiện tại được giữ nguyên.</p><div class=row><button class=del id=rpl>Thay thế toàn bộ</button><button class=pri id=rmg>Gộp vào dữ liệu hiện tại</button></div>`);
  const ov=document.querySelector('.ov'),run=async fn=>{ov.remove();try{await fn()}catch(e){toast('Khôi phục thất bại, dữ liệu hiện tại được giữ nguyên: '+e.message,1)}};
  $('#rpl').onclick=()=>{if(confirm('Thay thế TOÀN BỘ dữ liệu hiện tại bằng bản sao lưu?'))run(async()=>{const t=db.transaction(STORES,'readwrite');STORES.forEach(s=>t.objectStore(s).clear());F.forEach(x=>t.objectStore('files').put(x));R.forEach(x=>t.objectStore('results').put(x));m.settings.forEach(x=>t.objectStore('settings').put(x));await txDone(t);sess=[];toast('Đã khôi phục (thay thế toàn bộ).');library()})};
  $('#rmg').onclick=()=>run(async()=>{const cur={files:await dbAll('files'),results:await dbAll('results'),settings:await dbAll('settings')},o=Core.merge(cur,{files:F,results:R,settings:m.settings}),t=db.transaction(STORES,'readwrite');
   o.files.forEach(x=>t.objectStore('files').put(x));o.results.forEach(x=>t.objectStore('results').put(x));o.settings.forEach(x=>t.objectStore('settings').put(x));await txDone(t);
   toast(`Đã gộp: thêm ${o.files.length} file gốc, ${o.results.length} file mẫu, ${o.added.keys} API Key, ${o.added.history} mục lịch sử. Các mục trùng được bỏ qua.`);library()})}
 catch(e){toast('Khôi phục thất bại, dữ liệu hiện tại được giữ nguyên: '+e.message,1)}}
const NOCHAT=/whisper|tts|embed|guard|moderation|image|dall|rerank|audio|transcri|speech|imagen|veo|sora|aqa|bison|gecko/i;
const PROBE_SYS='Bạn nhận các dòng "P<số> | vị trí | nội dung" có mã vị trí dạng ⟦số.số⟧. Chỉ trả về JSON hợp lệ, không Markdown, theo dạng {"slots":[{"slot":"1.1","key":"TenKey","field_name":"...","reason":"...","confidence":0.9}]}, mỗi mã vị trí một phần tử, key PascalCase tiếng Việt không dấu.';
async function probe(k,model){const t0=Date.now();try{const r=await callAI({...k,model},PROBE_SYS,'P1 | Thân | Họ tên nhân viên: ⟦1.1⟧ Sinh ngày: ⟦1.2⟧',{tries:1});
 if(r.cut)return{ok:false,why:'Phản hồi bị cắt do giới hạn đầu ra'};let o;try{o=parseSlots(r.text)}catch{return{ok:false,why:r.text.trim()?'Không trả về JSON hợp lệ':'Phản hồi rỗng (thường gặp ở model reasoning)'}}
 return['1.1','1.2'].every(x=>o.some(i=>i.slot===x&&cleanKey(i.key)))?{ok:true,ms:Date.now()-t0}:{ok:false,why:'JSON thiếu vị trí hoặc key'}}
 catch(e){return/HTTP 429/.test(e.message)?{ok:null,why:'Bị giới hạn tốc độ, hãy thử lại sau'}:{ok:false,why:e.message.slice(0,120)}}}
const cb=k=>{const c=k.compat?.[k.model];return c?(c.ok?'<span class=ok>✓ tương thích</span>':c.ok===false?'<span class=err>✗ không tương thích</span>':''):''};
const tm=ts=>{const d=new Date(ts);return d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})+(d.toDateString()===new Date().toDateString()?'':' '+d.toLocaleDateString('vi-VN'))};
const qInfo=k=>{const q=k.q;return(q?`<span class=ok>[API]</span> Đã sử dụng ${q.used}% token<br>${q.resetAt?(q.resetAt>Date.now()?`Token hồi đầy lúc ${tm(q.resetAt)}`:'Mốc hồi token theo API đã qua – hãy kiểm tra lại'):'Thời điểm hồi token: chưa có dữ liệu'} <span class=muted>(cập nhật ${tm(q.at)})</span>`:'<span class=muted>Mức dùng và thời điểm hồi token: chưa có dữ liệu từ nhà cung cấp</span>')+`<br><span class=muted>[Hệ thống] Đã dùng qua ứng dụng: ${k.used||0} token (tự cộng dồn, không phải hạn mức)</span>`};
async function aiPage(){$('#main').innerHTML=`<h2>Cấu hình AI</h2><div class=tabs><a data-t=keys class="${tab==='keys'?'on':''}">API Key</a><a data-t=prompt class="${tab==='prompt'?'on':''}">Prompt</a></div><div id=tb></div>`;
 document.querySelector('.tabs').onclick=e=>{if(e.target.dataset.t){tab=e.target.dataset.t;aiPage()}};
 if(tab==='prompt'){$('#tb').innerHTML=`<div class=card><div class=row>Prompt cho: <select id=pm><option value=1>Chế độ 1 – dấu ba chấm</option><option value=2>Chế độ 2 – AI tự phân tích</option></select></div><textarea id=pt rows=24></textarea><div class=row><button class=pri id=ps>Lưu Prompt</button><button id=pr>Khôi phục mặc định</button></div><p class=muted>Chế độ 1 phải trả JSON {"slots":[{slot,key,field_name,reason,confidence}]}; Chế độ 2 phải trả JSON {"fields":[...]} như prompt mặc định. Sai cấu trúc thì ứng dụng không đọc được kết quả.</p></div>`;
  const ld=async()=>{$('#pt').value=+$('#pm').value===1?await getSet('promptDots',DEFAULT_PROMPT_DOTS):await getPrompt()};await ld();$('#pm').onchange=ld;
  $('#ps').onclick=async()=>{if(+$('#pm').value===1)await setSet('promptDots',$('#pt').value);else{await setSet('prompt',$('#pt').value);await setSet('promptV',3)}toast('Đã lưu Prompt.')};
  $('#pr').onclick=async()=>{if(+$('#pm').value===1)await setSet('promptDots',DEFAULT_PROMPT_DOTS);else{await setSet('prompt',DEFAULT_PROMPT);await setSet('promptV',3)}await ld();toast('Đã khôi phục mặc định.')};return}
 const ks=await keys(),act=await getSet('activeKey',null);
 $('#tb').innerHTML=`<div class=warn><b>Cảnh báo bảo mật:</b> API Key được lưu dạng văn bản thường trong IndexedDB của trình duyệt này và nằm trong file sao lưu. Không dùng trên máy công cộng; nên dùng key có hạn mức thấp và thu hồi khi không cần.</div>
 <div class=card>${ks.map(k=>`<div class=kr><div><span class="bd${k.id===act?' on':''}">● Đang dùng</span><b class=kn>${esc(k.name)}</b><div class=muted>${esc(PROVIDERS[k.provider]?.name||k.provider)} / ${esc(k.model)} ${cb(k)} · ${esc(k.key.slice(0,4))}••••${esc(k.key.slice(-3))}</div><div class=kq>${qInfo(k)}</div></div><div class=act><button data-a=use data-id=${k.id} ${k.id===act?'disabled':''}>Dùng</button><button data-a=test data-id=${k.id}>Kiểm tra</button><button data-a=ed data-id=${k.id}>Sửa</button><button class=del data-a=rm data-id=${k.id}>Xóa</button></div></div>`).join('')||'<p class=muted>Chưa có API Key.</p>'}</div>
 <div class=card><h3 id=fh>Thêm API Key</h3><input type=hidden id=kid><div class=row><input id=kn placeholder="Tên gợi nhớ (vd: Gemini free #1)"><select id=kp>${Object.entries(PROVIDERS).map(([i,p])=>`<option value=${i}>${p.name}</option>`).join('')}</select><input id=km list=ml placeholder="Model ID" size=28><datalist id=ml></datalist></div>
 <div class=row><input id=kk type=password placeholder="API Key" size=48></div><div class=row><button class=pri id=sv>Lưu</button><button id=tk>Kiểm tra kết nối</button><button id=lm>Tải danh sách model</button><button id=cm>Kiểm tra tương thích model</button></div><div id=cp></div></div>`;
 const fk=()=>({id:$('#kid').value||crypto.randomUUID(),name:$('#kn').value.trim(),provider:$('#kp').value,model:$('#km').value.trim(),key:$('#kk').value.trim()});
 const sync=()=>{$('#ml').innerHTML=PROVIDERS[$('#kp').value].models.map(m=>`<option value="${m}">`).join('')};$('#kp').onchange=()=>{cmp={};$('#cp').innerHTML='';sync()};sync();
 const test=async(k,save)=>{if(!k.key||!k.model)return toast('Cần nhập model và API Key để kiểm tra.',1);try{toast('Đang kiểm tra '+(k.name||k.provider)+'…');const r=await callAI(k,'Trả lời đúng một từ: OK','Kiểm tra kết nối',{tries:1,json:false});
  toast('Kết nối thành công. Phản hồi: '+r.text.slice(0,40)+(r.quota?'':' (nhà cung cấp không trả dữ liệu token)'));if(save&&r.quota){const a=await keys(),x=a.find(y=>y.id===k.id);x.q=r.quota;await setSet('keys',a);aiPage()}}catch(e){toast(e.message,1)}};
 let cmp={};const slp=n=>new Promise(r=>setTimeout(r,n));
 $('#cm').onclick=async()=>{const k=fk();if(!k.key)return toast('Nhập API Key trước.',1);let ms;
  try{toast('Đang tải danh sách model…');ms=(await listModels(k)).filter(m=>!NOCHAT.test(m)).sort()}catch(e){return toast(e.message,1)}
  if(!ms.length)return toast('Nhà cung cấp không trả danh sách model.',1);
  const sel=new Set(ms.length<=20?ms:[]);let run=false,stop=false;
  const st=m=>{const c=cmp[m];return!c?'<span class=muted>chưa kiểm tra</span>':c.ok?`<span class=ok>✓ Tương thích (${(c.ms/1000).toFixed(1)}s)</span>`:c.ok===false?`<span class=err>✗ ${esc(c.why)}</span>`:`<span class=muted>⏳ ${esc(c.why)}</span>`};
  const draw=()=>{const q=($('#cf')?.value||'').toLowerCase();$('#cp').innerHTML=`<div class=card style="margin-top:10px"><b>Tương thích model (${ms.length} model chat)</b><p class=muted>Mỗi model được thử bằng một yêu cầu nhỏ giống cách ứng dụng dùng (khoảng 200 token). Model đạt khi trả đúng JSON. Danh sách trên 20 model mặc định chưa chọn sẵn để tránh tốn quota.</p><div class=row><input id=cf placeholder="Lọc tên model" value="${esc(q)}"><button id=ca>Chọn tất cả đang lọc</button><button id=cn>Bỏ chọn</button><button class=pri id=cr>Kiểm tra các model đã chọn</button><button id=cs>Dừng</button></div><table>${ms.filter(m=>m.toLowerCase().includes(q)).map(m=>`<tr><td><input type=checkbox data-m="${esc(m)}" ${sel.has(m)?'checked':''}></td><td>${esc(m)}</td><td data-s="${esc(m)}">${st(m)}</td><td><button data-u="${esc(m)}">Chọn</button></td></tr>`).join('')}</table></div>`};
  draw();
  $('#cp').onchange=e=>{const t=e.target;if(t.dataset.m!=null)t.checked?sel.add(t.dataset.m):sel.delete(t.dataset.m);if(t.id==='cf')draw()};
  $('#cp').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
   if(b.dataset.u){$('#km').value=b.dataset.u;return toast('Đã chọn model '+b.dataset.u+'. Bấm Lưu để lưu vào API Key.')}
   if(b.id==='ca'){const q=$('#cf').value.toLowerCase();ms.filter(m=>m.toLowerCase().includes(q)).forEach(m=>sel.add(m));draw()}
   if(b.id==='cn'){sel.clear();draw()}if(b.id==='cs')stop=true;
   if(b.id==='cr'&&!run){const todo=ms.filter(m=>sel.has(m));if(!todo.length)return toast('Chưa chọn model nào.',1);run=true;stop=false;
    for(const m of todo){if(stop)break;const c=document.querySelector(`[data-s="${CSS.escape(m)}"]`);if(c)c.innerHTML='<span class=muted>đang thử…</span>';
     let r=await probe(fk(),m);if(r.ok===null&&!stop){await slp(4000);r=await probe(fk(),m)}cmp[m]={...r,at:Date.now()};if(c)c.innerHTML=st(m);await slp(500)}
    run=false;const id=$('#kid').value;if(id){const a=await keys(),x=a.find(y=>y.id===id);if(x){x.compat=cmp;await setSet('keys',a)}}toast(stop?'Đã dừng.':'Đã kiểm tra xong. Chọn model ✓ rồi bấm Lưu.')}}};
 $('#tk').onclick=()=>test(fk());
 $('#lm').onclick=async()=>{const k=fk();if(!k.key)return toast('Nhập API Key trước.',1);try{const m=await listModels(k);$('#ml').innerHTML=m.map(x=>`<option value="${esc(x)}">`).join('');toast(`Đã tải ${m.length} model. Nhấn vào ô Model để chọn.`)}catch(e){toast(e.message,1)}};
 $('#tb').onclick=async e=>{const b=e.target.closest('button[data-a]');if(!b)return;const id=b.dataset.id,k=ks.find(x=>x.id===id);
  if(b.dataset.a==='use'){await setSet('activeKey',id);aiPage()}else if(b.dataset.a==='test')test(k,true);else if(b.dataset.a==='rm'){if(confirm('Xóa API Key này?')){await setSet('keys',ks.filter(x=>x.id!==id));if(act===id)await setSet('activeKey',null);aiPage()}}
  else{$('#fh').textContent='Sửa API Key';$('#kid').value=id;$('#kn').value=k.name;$('#kp').value=k.provider;sync();$('#km').value=k.model;$('#kk').value=k.key;cmp=k.compat||{};$('#cp').innerHTML='';$('#fh').scrollIntoView()}};
 $('#sv').onclick=async()=>{const o={...fk(),compat:cmp};if(!o.name||!o.model||!o.key)return toast('Cần nhập tên, model và API Key.',1);const i=ks.findIndex(k=>k.id===o.id);if(i>=0)ks[i]={...ks[i],...o};else ks.push(o);await setSet('keys',ks);if(!act)await setSet('activeKey',o.id);toast('Đã lưu API Key.');aiPage()}}
const PAGES={home,process:processPage,library,ai:aiPage};
const route=()=>{const m=$('#main');m.onclick=m.oninput=m.onchange=null;const p=(location.hash||'#home').slice(1);document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.dataset.p===p));(PAGES[p]||home)()};
addEventListener('hashchange',route);
openDB().then(d=>{db=d;if(!Core.slots||!Core.merge)toast('core.js chưa phải bản mới nhất – hãy chép đè core.js, rồi nhấn Ctrl+F5.',1);route()}).catch(e=>{$('#main').innerHTML='<div class=warn>Không mở được IndexedDB: '+esc(e.message)+'</div>'});
