const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
test('real Supabase: login, realtime chat, return like, unmatch, report and block',async({browser})=>{
  test.skip(process.env.SPARK_LIVE!=='1','Opt-in: requires disposable backend fixtures.');
  test.setTimeout(120000);
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'backend-fixture.local.json'),'utf8'));
  const contexts=[];
  const pages=[];
  try {
    for(const user of fixture.users) {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
      const page=await context.newPage();pages.push(page);
      await page.goto('http://127.0.0.1:8089');
      await page.locator('#loginEmail').fill(user.email);
      await page.locator('#loginPass').fill(user.password);
      await page.locator('#loginForm button[type=submit]').click();
      await expect(page.locator('#screen-discover')).toBeVisible({timeout:30000});
    }
    const [alice,bob,charlie]=pages;
    const [a,b,c]=fixture.users;
    await alice.evaluate(id=>abrirChat(id),b.id);
    await bob.evaluate(id=>abrirChat(id),a.id);
    const text=`Browser smoke ${Date.now()}`;
    await alice.locator('#chatInput').fill(text);await alice.locator('#sendBtn').click();
    await expect(alice.locator('#chatBody')).toContainText(text);
    await expect(bob.locator('#chatBody')).toContainText(text,{timeout:25000});
    await bob.locator('#stickerBtn').click();await bob.locator('.sticker-option').first().click();
    await expect(alice.locator('#chatBody')).toContainText('😍',{timeout:25000});
    await alice.reload();await expect(alice.locator('#screen-discover')).toBeVisible({timeout:30000});
    await alice.evaluate(id=>abrirChat(id),b.id);await expect(alice.locator('#chatBody')).toContainText(text);
    // Two genuine swipes must yield the database UUID, not a local fake match.
    await bob.evaluate(async id=>{fecharChat();const p=state.deck.find(p=>p.id===id);if(!p)throw Error('fixture missing');await registrarSwipe(p,'like');},c.id);
    await charlie.evaluate(()=>navigate('likes'));
    await expect(charlie.locator('#likesGrid')).toContainText(b.name);
    await charlie.locator(`#likesGrid .like-card[data-id="${b.id}"]`).click();
    await expect.poll(()=>charlie.evaluate(id=>state.matches.some(m=>m.id===id&&/^[\da-f-]{36}$/.test(m.matchId)),b.id)).toBe(true);
    await charlie.evaluate(()=>document.querySelector('#matchModal').classList.remove('show'));
    await charlie.evaluate(id=>abrirChat(id),b.id);
    await charlie.locator('#chatMenuBtn').click();await charlie.locator('#chatReport').click();
    await charlie.locator('.report-option').first().click();await charlie.locator('#confirmReport').click();
    await expect(charlie.locator('#toastContainer')).toContainText('Denúncia registrada e contato bloqueado');
    await charlie.reload();await expect(charlie.locator('#screen-discover')).toBeVisible({timeout:30000});
    expect(await charlie.evaluate(id=>state.matches.some(m=>m.id===id)||state.deck.some(p=>p.id===id),b.id)).toBe(false);
    await alice.locator('#chatMenuBtn').click();alice.once('dialog',d=>d.accept());await alice.locator('#chatUnmatch').click();
    await expect(alice.locator('#toastContainer')).toContainText('Match desfeito');
    await alice.reload();await expect(alice.locator('#screen-discover')).toBeVisible({timeout:30000});
    expect(await alice.evaluate(id=>state.matches.some(m=>m.id===id),b.id)).toBe(false);
  } finally {for(const context of contexts)await context.close();}
});


test('real onboarding and photo editing persist across reloads',async({page})=>{
  test.skip(process.env.SPARK_LIVE!=='1','Opt-in: disposable backend fixtures required.');
  test.setTimeout(90000);
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'backend-fixture.local.json'),'utf8'));
  const user=fixture.users[2];
  const png={name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')};
  await page.goto('/');await page.locator('#loginEmail').fill(user.email);await page.locator('#loginPass').fill(user.password);await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#screen-discover')).toBeVisible({timeout:30000});
  await page.evaluate(async()=>{const {error}=await sparkClient.from('profiles').update({onboarding_complete:false}).eq('id',state.userId);if(error)throw Error(error.message);});
  await page.reload();await expect(page.locator('#screen-onboarding')).toBeVisible();
  await page.locator('#onbName').fill('Teste Fotos');await page.locator('#onbNext').click();
  await page.locator('.onb-step.active [data-value="Homem"]').click();await page.locator('#onbNext').click();
  await page.locator('.onb-step.active [data-value="Todos"]').click();await page.locator('#onbNext').click();
  await page.locator('#onbBirth').fill('2000-06-15');await page.locator('#onbNext').click();
  await page.locator('body > input[type=file]').setInputFiles(png);
  await expect(page.locator('#onbPhotoGrid .filled')).toHaveCount(1,{timeout:15000});await page.locator('#onbNext').click();
  await page.locator('#onbBio').fill('Perfil descartável de validação.');await page.locator('#onbNext').click();
  for(let i=0;i<3;i++)await page.locator('#onbInterests .chip').nth(i).click();
  await page.locator('#onbNext').click();await expect(page.locator('#screen-discover')).toBeVisible({timeout:30000});
  await page.reload();await expect(page.locator('#screen-discover')).toBeVisible({timeout:30000});
  expect(await page.evaluate(()=>state.user.birthDate)).toBe('2000-06-15');
  await page.evaluate(()=>navigate('edit-profile'));
  await page.locator('#editPhotoInput').setInputFiles(png);await expect(page.locator('#editPhotos button')).toHaveCount(2,{timeout:15000});
  await page.locator('#editName').fill('Fotos Atualizadas');await page.locator('#saveProfile').click();await expect(page.locator('#screen-profile')).toBeVisible({timeout:15000});
  await page.reload();await expect(page.locator('#screen-discover')).toBeVisible({timeout:30000});
  expect(await page.evaluate(()=>state.user.nome)).toBe('Fotos Atualizadas');expect(await page.evaluate(()=>state.user.fotos.length)).toBe(2);
  await page.evaluate(async()=>{const paths=state.user.fotos.map(url=>new URL(url).pathname.split('/photos/')[1]);const {error}=await sparkClient.storage.from('photos').remove(paths);if(error)throw Error(error.message);});
});
