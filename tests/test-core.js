// Chạy: npm i jszip @xmldom/xmldom && node tests/test-core.js  (kiểm thử logic thay Key trên file Word tổng hợp)
const{DOMParser,XMLSerializer}=require('@xmldom/xmldom'),Core=require('../core.js'),assert=require('assert');
const r=(t,b)=>`<w:r>${b?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${t}</w:t></w:r>`,p=(...x)=>`<w:p>${x.join('')}</w:p>`;
const xml=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`+p(r('Căn cứ Bộ luật Lao động ngày 20 tháng 11 năm 2019'))+p(r('Sinh ngày: ..',1),r('.......'),r(' Tại: '),r('.........'))+p(r('Ông: .........'),'<w:r><w:tab/></w:r>',r('Quốc tịch: Việt Nam'))+p(r('Từ ngày...... tháng...... năm...... đến ngày...... tháng...... năm......'))+'<w:tbl><w:tr><w:tc>'+p(r('Mức lương: ........'))+'</w:tc></w:tr></w:tbl>'+p(r('Mức lương: ........'))+'</w:body></w:document>';
const d=new DOMParser().parseFromString(xml,'text/xml'),parts=[{name:'x',doc:d}],D='.........',T='...... tháng...... năm......';
const F=(key,before,original,after='',context='')=>({key,before,original,after,context});
const fields=[F('NgayCan','Căn cứ Bộ luật Lao động ngày ','20 tháng 11 năm 2019'),F('NgaySinh','Sinh ngày: ',D,' Tại:','Sinh ngày: ......... Tại: .........'),F('NoiSinh','Tại: ',D),F('HoTen','Ông: ',D,'Quốc tịch'),F('NgayBD','Từ ngày',T,' đến'),F('NgayKT','đến ngày',T),F('Luong','Mức lương: ','........'),F('Luong','Mức lương: ','........')];
Core.execute(Core.plan(Core.segs(parts,'docx'),fields));
const t=Core.segs(parts,'docx').map(s=>s.text);
assert(t[0].includes('20 tháng 11 năm 2019'),'căn cứ pháp lý phải giữ nguyên');assert(fields[0].blocked);
assert.strictEqual(t[1],'Sinh ngày: {{NgaySinh}} Tại: {{NoiSinh}}');
assert(t[2].startsWith('Ông: {{HoTen}}')&&t[2].endsWith('Quốc tịch: Việt Nam'),'Tab + nội dung cố định');
assert(t[3].includes('{{NgayBD}} đến ngày{{NgayKT}}'),'hai ngày khác Key');
assert(t[4].includes('{{Luong}}')&&t[5].includes('{{Luong}}'),'một Key nhiều vị trí (bảng + thân)');
assert(new XMLSerializer().serializeToString(d).includes('<w:b/>'),'giữ định dạng run');assert.deepStrictEqual(Core.verify(Core.segs(parts,'docx')),[]);
console.log('PASS: tất cả kiểm tra đạt');
