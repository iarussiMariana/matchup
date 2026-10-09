const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const ctx=vm.createContext({URL,console,window:{addEventListener(){}},Date});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','script.js'),'utf8'),ctx);

test('age rejects invalid dates rather than normalizing them',()=>{
  for(const date of ['','bad','2000-02-30','2000-13-01','2000-00-01'])assert.ok(Number.isNaN(ctx.calcularIdade(date)));
  const today=new Date();const birth=new Date(today.getFullYear()-20,today.getMonth(),today.getDate());
  const value=`${birth.getFullYear()}-${String(birth.getMonth()+1).padStart(2,'0')}-${String(birth.getDate()).padStart(2,'0')}`;
  assert.equal(ctx.calcularIdade(value),20);
});
test('profile text cannot generate markup',()=>{
  assert.equal(ctx.escapeHtml('<b>"A&B"</b>'), '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
  assert.ok(!ctx.avatarHtml('<script>').includes('<script>'));
});
test('avatars permit only public project photo URLs',()=>{
  assert.equal(ctx.photoUrl('javascript:alert(1)'), '');
  assert.equal(ctx.photoUrl('https://example.com/photo.png'), '');
  assert.equal(ctx.photoUrl('https://drvqiiddgcgvmbbnwdky.supabase.co.evil.example/storage/v1/object/public/photos/a'), '');
  assert.ok(ctx.avatarHtml('https://drvqiiddgcgvmbbnwdky.supabase.co/storage/v1/object/public/photos/a.png').includes('<img'));
});
test('profile colors cannot inject CSS',()=>{
  assert.equal(ctx.safeColor('#ff00AA'),'#ff00AA');assert.equal(ctx.safeColor('red);background:url(x)'),'#A855F7');
});
