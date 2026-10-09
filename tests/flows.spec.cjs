const { test, expect } = require('@playwright/test');
let pageErrors;
test.beforeEach(async({page})=>{pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));});
test.afterEach(()=>expect(pageErrors).toEqual([]));
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MATCH = '33333333-3333-4333-8333-333333333333';
const profile = {id:USER,name:'Teste',age:25,birth_date:'2000-06-15',gender:'Mulher',looking_for:'Todos',city:'Sorocaba',interests:['Música','Games','Café'],photos:['🦄'],onboarding_complete:true};
const other = {...profile,id:OTHER,name:'Outro <b>nome</b>'};
function session() {
  const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  return {access_token:`${enc({alg:'HS256'})}.${enc({sub:USER,exp:Math.floor(Date.now()/1000)+3600})}.test`, refresh_token:'fixture', expires_in:3600, token_type:'bearer',user:{id:USER,email:'test@example.com',app_metadata:{provider:'email'},user_metadata:{}}};
}
async function mock(page, options={}) {
  const writes=[];
  // Existing regressions exercise an account that already chose Relationships.
  if (!options.hub) await page.addInitScript(id => localStorage.setItem(`spark_mode_${id}`, 'dating'), USER);
  await page.route('**/drvqiiddgcgvmbbnwdky.supabase.co/**', async route => {
    const req=route.request(), url=new URL(req.url()), method=req.method();
    const body=req.postDataJSON();
    if (method !== 'GET') writes.push({path:url.pathname,query:url.search,method,body});
    let data=[], status=200;
    if (url.pathname.endsWith('/rpc/reset_my_test_activity')) {
      if(options.resetDelay) await new Promise(resolve=>setTimeout(resolve,options.resetDelay));
      if(options.resetError) {status=500;data={message:'reset failed'};}
      else {
        options.swipes=(options.swipes||[]).filter(s=>body.reset_mode==='nope' && s.direction!=='nope');
        if(body.reset_mode==='all') options.matches=false;
        data={mode:body.reset_mode};
      }
    }
    else if (url.pathname.endsWith('/signup')) data = options.signup || {user:{id:USER},session:null};
    else if (url.pathname.endsWith('/token')) data = session();
    else if (url.pathname.endsWith('/logout')) data = {};
    else if (url.pathname.endsWith('/recover')) data = {};
    else if (url.pathname.endsWith('/profiles')) {
      if (method !== 'GET') {
        if(options.profileError) {status=500; data={message:'save failed'};}
        else data={id:USER};
      } else data = req.headers().accept?.includes('vnd.pgrst.object') ? {...profile,...options.profile,onboarding_complete:!options.incomplete} : [other];
    } else if (url.pathname.endsWith('/swipes')) {
      if(method==='POST' && options.swipeError) {status=500;data={message:'swipe failed'};}
      else data=options.swipes||[];
    } else if (url.pathname.endsWith('/reports') || url.pathname.endsWith('/blocks')) {
      if(options.reportError || (options.blockError && url.pathname.endsWith('/blocks'))) {status=500;data={message:'save failed'};}
      else data={id:'test-report'};
    } else if (url.pathname.endsWith('/notifications')) {
      if (method==='PATCH') {
        if(options.notificationReadError) {status=500;data={message:'read failed'};}
        else {
          const id=url.searchParams.get('id')?.replace('eq.','');
          (options.notifications||[]).filter(n=>!id||n.id===id).forEach(n=>n.read=true);
          data=[];
        }
      } else data=options.notifications||[];
    } else if (url.pathname.endsWith('/matches')) {
      if(options.matchesDelay) await new Promise(resolve=>setTimeout(resolve,options.matchesDelay));
      data=options.matches ? [{id:MATCH,user1_id:USER,user2_id:OTHER,user1:profile,user2:{...other,...options.other}}] : [];
      if(options.matchesError) {status=500;data={message:'matches unavailable'};}
      if(method==='PATCH') {
        if(options.unmatchError) {status=500;data={message:'save failed'};}
        else {options.matches=false;data={id:MATCH};}
      }
    } else if (url.pathname.endsWith('/messages')) {
      if (method==='POST') {
        if (options.messageError) {status=500;data={message:'send failed'};}
        else data={id:crypto.randomUUID(),...body,created_at:new Date().toISOString()};
      } else data=[];
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/');
  return writes;
}
async function login(page) {
  await page.locator('#loginEmail').fill('test@example.com');
  await page.locator('#loginPass').fill('password123');
  await page.locator('#loginForm button[type=submit]').click();
}

test('auth tabs work without internet or CDN',async({page,context})=>{
  await page.route('https://**/*',r=>r.abort());
  await page.goto('/');
  await context.setOffline(true);
  await page.locator('[data-tab=register]').tap();
  await expect(page.locator('#registerForm')).toBeVisible();
  await page.locator('[data-tab=login]').tap();
  await expect(page.locator('#loginForm')).toBeVisible();
});

test('signup requiring confirmation stays unauthenticated and explains next step',async({page})=>{
  const writes=await mock(page);
  await page.locator('[data-tab=register]').click();
  await page.locator('#regName').fill('Teste');
  await page.locator('#regEmail').fill('test@example.com');
  await page.locator('#regBirth').fill('2000-06-15');
  await page.locator('#regPass').fill('password123');
  await page.locator('#registerForm button[type=submit]').click();
  await expect(page.locator('#authNotice')).toContainText('Confirme seu e-mail');
  await expect(page.locator('#screen-onboarding')).toBeHidden();
  expect(writes.filter(w=>w.path.endsWith('/signup'))).toHaveLength(1);
  expect(await page.evaluate(()=>state.userId)).toBeNull();
});

test('restored incomplete profile routes to onboarding and preserves birthday',async({page})=>{
  await mock(page,{incomplete:true});
  await login(page);
  await expect(page.locator('#screen-onboarding')).toBeVisible();
  expect(await page.locator('#onbBirth').inputValue()).toBe('2000-06-15');
  await page.reload();
  await expect(page.locator('#screen-onboarding')).toBeVisible();
});

test('discovery uses the age column and keeps failed swipes retryable',async({page})=>{
  const reads=[];page.on('request',r=>reads.push(r.url()));
  await mock(page,{swipeError:true});await login(page);
  await expect(page.locator('.profile-card')).toHaveCount(1);
  await page.locator('#btnLike').click();
  await expect(page.locator('#toastContainer')).toContainText('Não foi possível concluir');
  await expect(page.locator('.profile-card')).toHaveCount(1);
  expect(reads.some(u=>u.includes('age=gte.'))).toBeTruthy();
  expect(reads.some(u=>u.includes('idade='))).toBeFalsy();
});

test('UUID match opens chat and user content is text, not HTML',async({page})=>{
  await mock(page,{matches:true});await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>navigate('matches'));
  await page.locator(`.new-match-pill[data-id="${OTHER}"]`).click();
  await expect(page.locator('#chatRoom')).toHaveClass(/open/);
  await expect(page.locator('#roomName')).toHaveText(other.name);
  expect(await page.locator('#matchesList b').count()).toBe(0);
});

test('failed messages are not displayed as sent and draft remains',async({page})=>{
  await mock(page,{matches:true,messageError:true});await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(id=>abrirChat(id),OTHER);
  await page.locator('#chatInput').fill('Mensagem pendente');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#toastContainer')).toContainText('Mensagem não enviada');
  await expect(page.locator('#chatInput')).toHaveValue('Mensagem pendente');
  await expect(page.locator('#chatBody .bubble.sent')).toHaveCount(0);
});

test('stickers use persisted messages with the real match UUID',async({page})=>{
  const writes=await mock(page,{matches:true});await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(id=>abrirChat(id),OTHER);
  await page.evaluate(()=>enviarSticker('😍'));
  expect(writes.find(w=>w.path.endsWith('/messages')&&w.method==='POST').body).toEqual({match_id:MATCH,sender_id:USER,content:'😍'});
  await expect(page.locator('#chatBody')).toContainText('😍');
});

test('onboarding save failure leaves the form open and user incomplete',async({page})=>{
  await mock(page,{incomplete:true,profileError:true});await login(page);
  await expect(page.locator('#screen-onboarding')).toBeVisible();
  await page.evaluate(()=>{
    Object.assign(onboardingData,{name:'Teste',gender:'Mulher',looking:'Todos',birth:'2000-06-15',photos:['🦄'],interests:['Música','Games','Café']});
    return finalizarOnboarding();
  });
  await expect(page.locator('#screen-onboarding')).toBeVisible();
  await expect(page.locator('#toastContainer')).toContainText('Não foi possível salvar o perfil');
  expect(await page.evaluate(()=>state.user.onboardingComplete)).toBe(false);
});

test('cancelled interest edits do not mutate the saved profile',async({page})=>{
  await mock(page);await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>navigate('edit-profile'));
  await page.locator('#editInterests .chip').first().click();
  await page.locator('#backFromEdit').click();
  expect(await page.evaluate(()=>state.user.interesses)).toEqual(profile.interests);
});

test('failed profile save never reports success or mutates the saved name',async({page})=>{
  await mock(page,{profileError:true});await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>navigate('edit-profile'));
  await page.locator('#editName').fill('Nome novo');
  await page.locator('#saveProfile').click();
  await expect(page.locator('#toastContainer')).toContainText('Perfil não salvo');
  expect(await page.evaluate(()=>state.user.nome)).toBe('Teste');
});

test('invalid filter range is rejected',async({page})=>{
  await mock(page);await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.locator('#btnFilter').click();
  await page.locator('#filterAgeMin').fill('40');await page.locator('#filterAgeMax').fill('20');
  await page.locator('#applyFilters').click();
  await expect(page.locator('#toastContainer')).toContainText('Faixa etária inválida');
});

test('failed unmatch retains the conversation',async({page})=>{
  await mock(page,{matches:true,unmatchError:true});await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(id=>abrirChat(id),OTHER);await page.locator('#chatMenuBtn').click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#chatUnmatch').click();
  await expect(page.locator('#toastContainer')).toContainText('Não foi possível desfazer');
  expect(await page.evaluate(()=>state.matches.length)).toBe(1);
});

test('report failure never claims a successful block',async({page})=>{
  const writes=await mock(page,{matches:true,reportError:true});await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(id=>abrirChat(id),OTHER);await page.locator('#chatMenuBtn').click();await page.locator('#chatReport').click();
  await page.locator('.report-option').first().click();await page.locator('#confirmReport').click();
  await expect(page.locator('#toastContainer')).toContainText('Denúncia não enviada');
  expect(writes.some(w=>w.path.endsWith('/blocks'))).toBe(false);
  expect(await page.evaluate(()=>state.matches.length)).toBe(1);
});

test('partial report failure retries blocking without duplicating the report',async({page})=>{
  const options={matches:true,blockError:true};const writes=await mock(page,options);await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(id=>abrirChat(id),OTHER);await page.locator('#chatMenuBtn').click();await page.locator('#chatReport').click();
  await page.locator('.report-option').first().click();await page.locator('#confirmReport').click();
  await expect(page.locator('#toastContainer')).toContainText('Denúncia registrada, mas o bloqueio falhou');
  options.blockError=false;await page.locator('#confirmReport').click();
  await expect(page.locator('#toastContainer')).toContainText('Denúncia registrada e contato bloqueado');
  expect(writes.filter(w=>w.path.endsWith('/reports'))).toHaveLength(1);
  expect(writes.filter(w=>w.path.endsWith('/blocks'))).toHaveLength(2);
});

test('invalid recovery links are rejected without sending verification',async({page})=>{
  const writes=await mock(page);await page.evaluate(()=>openRecovery());
  await page.locator('#recoveryLink').fill('https://example.com/fake');await page.locator('#recoveryPassword').fill('password123');
  await page.locator('#recoveryApplyForm button[type=submit]').click();
  await expect(page.locator('#toastContainer')).toContainText('Copie o endereço original');
  expect(writes.some(w=>w.path.endsWith('/verify'))).toBe(false);
});

test('preferences and favorite lines survive reloading and are account-scoped',async({page})=>{
  await mock(page);await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>{state.filters.idadeMax=60;state.favoriteLines=['favorite'];salvarEstado();});
  await page.reload();await expect(page.locator('#screen-discover')).toBeVisible();
  expect(await page.evaluate(()=>state.filters.idadeMax)).toBe(60);
  expect(await page.evaluate(()=>state.favoriteLines)).toEqual(['favorite']);
  expect(await page.evaluate(()=>localStorage.getItem('spark_session'))).toBeNull();
});

async function settings(page) {
  await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>navigate('settings'));
}
const resetWrites = writes => writes.filter(w=>w.path.endsWith('/rpc/reset_my_test_activity'));

test('reset cancellation never changes server data',async({page})=>{
  const writes=await mock(page,{matches:true});await settings(page);
  await page.locator('#resetActivityBtn').click();
  await expect(page.locator('#resetActivityDescription')).toContainText('para os dois participantes');
  await page.locator('#cancelActivityReset').click();
  await expect(page.locator('#resetActivityModal')).toBeHidden();
  expect(resetWrites(writes)).toHaveLength(0);
  expect(await page.evaluate(()=>state.matches.length)).toBe(1);
});

test('reset only nopes restores discovery and preserves matches and preferences after reload',async({page})=>{
  const writes=await mock(page,{matches:true,swipes:[{swiped_id:OTHER,direction:'nope'}]});await settings(page);
  await page.evaluate(()=>{state.filters.idadeMax=60;state.favoriteLines=['keep'];salvarEstado();});
  await page.locator('#resetNopesBtn').click();await page.locator('#confirmActivityReset').click();
  await expect(page.locator('#resetActivityModal')).toBeHidden();
  await expect(page.locator('.profile-card')).toHaveCount(1);
  expect(resetWrites(writes).map(w=>w.body)).toEqual([{reset_mode:'nope'}]);
  expect(await page.evaluate(()=>state.matches.length)).toBe(1);
  await page.reload();await expect(page.locator('#screen-discover')).toBeVisible();
  expect(await page.evaluate(()=>[state.user.nome,state.matches.length,state.filters.idadeMax,state.favoriteLines])).toEqual(['Teste',1,60,['keep']]);
});

test('reset all clears matches and chat caches and can be repeated',async({page})=>{
  const writes=await mock(page,{matches:true,swipes:[{swiped_id:OTHER,direction:'like'}]});await settings(page);
  await page.evaluate(id=>{state.chats[id]=[{texto:'old'}];state.unread[id]=1;state.lastSwiped={id};},OTHER);
  for(let i=0;i<2;i++) {
    await page.evaluate(()=>navigate('settings'));
    await page.locator('#resetActivityBtn').click();await page.locator('#confirmActivityReset').click();
    await expect(page.locator('#resetActivityModal')).toBeHidden();
    await expect(page.locator('#screen-discover')).toBeVisible();
  }
  expect(resetWrites(writes).map(w=>w.body)).toEqual([{reset_mode:'all'},{reset_mode:'all'}]);
  expect(await page.evaluate(()=>({matches:state.matches,chats:state.chats,unread:state.unread,last:state.lastSwiped}))).toEqual({matches:[],chats:{},unread:{},last:null});
  await page.reload();await expect(page.locator('#screen-discover')).toBeVisible();
  expect(await page.evaluate(()=>state.matches.length)).toBe(0);
});

test('reset failure preserves data and permits retry without duplicate pending requests',async({page})=>{
  const options={matches:true,resetError:true,resetDelay:400};const writes=await mock(page,options);await settings(page);
  await page.locator('#resetActivityBtn').click();await page.locator('#confirmActivityReset').click();
  await expect(page.locator('#confirmActivityReset')).toBeDisabled();
  await expect(page.locator('#cancelActivityReset')).toBeDisabled();
  await page.evaluate(()=>document.querySelector('#confirmActivityReset').onclick());
  await page.keyboard.press('Escape');await expect(page.locator('#resetActivityModal')).toBeVisible();
  await expect(page.locator('#resetActivityStatus')).toContainText('Não foi possível confirmar');
  expect(resetWrites(writes)).toHaveLength(1);
  expect(await page.evaluate(()=>state.matches.length)).toBe(1);
  options.resetError=false;await page.locator('#confirmActivityReset').click();
  await expect(page.locator('#resetActivityModal')).toBeHidden();
  expect(resetWrites(writes)).toHaveLength(2);
});

for(const [shape,width,height] of [['portrait',300,600],['landscape',600,300]]) {
  test(`profile ${shape} photo stays circular and opens without cropping`,async({page})=>{
    const url=`https://drvqiiddgcgvmbbnwdky.supabase.co/storage/v1/object/public/photos/${USER}/sample.png`;
    await mock(page,{profile:{photos:[url]}});
    await page.route(url,r=>r.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="purple"/></svg>`}));
    await login(page);await expect(page.locator('#screen-discover')).toBeVisible();await page.evaluate(()=>navigate('profile'));
    const photo=page.locator('#profileEmoji img');await expect(photo).toBeVisible();
    await expect.poll(()=>photo.evaluate(img=>img.naturalWidth)).toBe(width);
    const bounds=await photo.boundingBox();expect(bounds.width).toBe(120);expect(bounds.height).toBe(120);
    await expect(page.locator('#profileEmoji')).toHaveCSS('overflow','hidden');
    await expect(page.locator('#profileEmoji')).toHaveCSS('border-radius','50%');
    await expect(photo).toHaveCSS('object-fit','cover');
    await page.locator('#profileEmoji').click();await expect(page.locator('#profilePhotoModal')).toBeVisible();
    await expect(page.locator('#profilePhotoPreview')).toHaveCSS('object-fit','contain');
    await expect(page.locator('#profilePhotoPreview')).toHaveAttribute('src',url);
    await page.locator('#closeProfilePhoto').click();await expect(page.locator('#profilePhotoModal')).toBeHidden();
    await page.locator('#editAvatarBtn').click();await expect(page.locator('#screen-edit-profile')).toBeVisible();
  });
}

test('campus interests and conversation starters stay usable on small screens',async({page})=>{
  await page.setViewportSize({width:320,height:640});await mock(page);
  await expect(page.locator('.auth-title')).toContainText('Campus');
  await expect(page.locator('.campus-disclaimer')).toContainText('sem vínculo oficial');
  await page.locator('[data-tab=register]').click();await expect(page.locator('#regName')).toBeVisible();
  await page.locator('[data-tab=login]').click();await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await expect(page.locator('#btnLike')).toBeInViewport();
  await expect(page.locator('[data-screen=profile]')).toBeInViewport();
  await page.evaluate(()=>navigate('edit-profile'));await expect(page.locator('#editInterests')).toContainText('Café no intervalo');
  await page.evaluate(()=>navigate('lines'));await page.locator('[data-cat=Campus]').click();
  await expect(page.locator('#screen-lines')).toContainText('Entre uma aula e outra');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('profile without a photo retains its emoji fallback',async({page})=>{
  await mock(page,{profile:{photos:[],avatar:'🦄'}});await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>navigate('profile'));await expect(page.locator('#profileEmoji')).toContainText('🦄');
  await expect(page.locator('#profileEmoji')).toBeDisabled();
});

const notification = (type, id='44444444-4444-4444-8444-444444444444') => ({id,type,user_id:USER,related_user_id:OTHER,title:`Nova ${type}`,body:'Olá <b>campus</b>',read:false,created_at:new Date().toISOString()});

test('profile statistics contain no fictitious response rate and label swipes honestly',async({page})=>{
  await mock(page,{matches:true,swipes:[{swiped_id:OTHER,direction:'nope'}]});await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();await page.evaluate(()=>navigate('profile'));
  await expect(page.locator('.profile-stats .stat-card')).toHaveCount(2);
  await expect(page.locator('#statLikes')).toHaveText('1');
  await expect(page.locator('.profile-stats')).toContainText('Avaliações enviadas');
  await expect(page.locator('.profile-stats')).not.toContainText('98%');
});

test('message notification opens its chat and marks only the selected notification read',async({page})=>{
  const n=notification('message');const options={matches:true,notifications:[n,notification('like','55555555-5555-4555-8555-555555555555')]};
  const writes=await mock(page,options);await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.locator('#btnNotif').click();await expect(page.locator('.notif-item.unread')).toHaveCount(2);
  expect(writes.filter(w=>w.path.endsWith('/notifications'))).toHaveLength(0);
  await page.locator('.notif-item').first().focus();await page.keyboard.press('Enter');
  await expect(page.locator('#chatRoom')).toHaveClass(/open/);await expect(page.locator('#roomName')).toHaveText(other.name);
  const read=writes.find(w=>w.path.endsWith('/notifications')&&w.method==='PATCH');
  expect(read.query).toContain(`id=eq.${n.id}`);expect(read.query).toContain(`user_id=eq.${USER}`);
  expect(options.notifications[1].read).toBe(false);
});

test('match notifications open full profiles; likes and superlikes open received likes',async({page})=>{
  const options={matches:true,notifications:[notification('match')]};await mock(page,options);await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();await page.locator('#btnNotif').click();await page.locator('.notif-item').click();
  await expect(page.locator('#matchedProfileName')).toHaveText(`${other.name}, 25`);
  await page.locator('#closeMatchedProfile').click();
  for(const type of ['like','super_like']) {
    options.notifications=[notification(type)];await page.evaluate(()=>navigate('notifications'));
    await expect(page.locator('.notif-item')).toContainText(`Nova ${type}`);await page.locator('.notif-item').click();
    await expect(page.locator('#screen-likes')).toBeVisible();
  }
});

test('stale notifications remain safe and realtime refresh updates the open list',async({page})=>{
  const options={matches:false,notifications:[notification('message')]};await mock(page,options);await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();await page.locator('#btnNotif').click();await page.locator('.notif-item').click();
  await expect(page.locator('#toastContainer')).toContainText('não está mais disponível');
  await expect(page.locator('#chatRoom')).not.toHaveClass(/open/);
  options.notifications.push(notification('like','55555555-5555-4555-8555-555555555555'));
  await page.evaluate(()=>refreshActivity());await expect(page.locator('.notif-item')).toHaveCount(2);
  await expect(page.locator('#notifList b')).toHaveCount(0);
});

test('notification read failure preserves unread status without preventing navigation',async({page})=>{
  const options={matches:true,notificationReadError:true,notifications:[notification('message')]};await mock(page,options);await login(page);
  await expect(page.locator('#screen-discover')).toBeVisible();await page.locator('#btnNotif').click();await page.locator('.notif-item').click();
  await expect(page.locator('#chatRoom')).toHaveClass(/open/);expect(options.notifications[0].read).toBe(false);
  await expect(page.locator('#toastContainer')).toContainText('marcar como lida');
});

test('matched profile exposes photos and bio from matches, header and menu without closing chat',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  const photos=[1,2].map(i=>`https://drvqiiddgcgvmbbnwdky.supabase.co/storage/v1/object/public/photos/${OTHER}/${i}.png`);
  await mock(page,{matches:true,other:{photos,bio:'Bio <b>real</b>',city:'Sorocaba',profession:'Estudante'}});
  for(const url of photos) await page.route(url,r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="purple"/></svg>'}));
  await login(page);await expect(page.locator('#screen-discover')).toBeVisible();await page.evaluate(()=>navigate('matches'));
  await page.locator('[data-profile]').click();
  await expect(page.locator('#matchedProfileBio')).toHaveText('Bio <b>real</b>');
  await expect(page.locator('#matchedProfilePhotos img')).toHaveCount(2);
  await expect(page.locator('#matchedProfilePhotos img').first()).toHaveCSS('object-fit','contain');
  await expect(page.locator('#matchedProfileCity')).toHaveText('Sorocaba');
  await expect(page.locator('#matchedProfileInterests')).toContainText('Música');
  await expect(page.locator('#matchedProfileModal b')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#matchedProfileChat').click();await expect(page.locator('#chatRoom')).toHaveClass(/open/);
  await page.locator('#chatInput').fill('Rascunho preservado');
  for(const trigger of ['#roomProfile','#roomAvatar','#chatViewProfile']) {
    if(trigger==='#chatViewProfile') await page.locator('#chatMenuBtn').click();
    await page.locator(trigger).click();await expect(page.locator('#matchedProfileContent')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.locator('#matchedProfileModal')).toBeHidden();
    await expect(page.locator('#chatRoom')).toHaveClass(/open/);await expect(page.locator('#chatInput')).toHaveValue('Rascunho preservado');
  }
});

test('matched profile retries network failures and hides data when the match disappears',async({page})=>{
  const options={matches:true};await mock(page,options);await login(page);await expect(page.locator('#screen-discover')).toBeVisible();
  await page.evaluate(()=>navigate('matches'));await expect.poll(()=>page.evaluate(()=>syncBusy)).toBe(false);
  options.matchesError=true;await page.locator('[data-profile]').click();
  await expect(page.locator('#matchedProfileStatus')).toContainText('Não foi possível carregar');
  await expect(page.locator('#matchedProfileContent')).toBeHidden();
  options.matchesError=false;await page.locator('#retryMatchedProfile').click();await expect(page.locator('#matchedProfileContent')).toBeVisible();
  options.matches=false;await page.evaluate(()=>refreshActivity());
  await expect(page.locator('#matchedProfileStatus')).toContainText('não está mais disponível');
  await expect(page.locator('#matchedProfileContent')).toBeHidden();
  await expect(page.locator('#matchedProfilePhotos')).toBeEmpty();
});

test('offline banner allows local controls and recovers on verified cloud connectivity',async({page,context})=>{
  await mock(page);await context.setOffline(true);
  await expect(page.locator('#connectionStatus')).toBeVisible();await expect(page.locator('#connectionMessage')).toContainText('Sem internet');
  await page.locator('[data-tab=register]').click();await expect(page.locator('#registerForm')).toBeVisible();
  await context.setOffline(false);await expect(page.locator('#connectionStatus')).toBeHidden();
});

test('one account enters the hub and uses studies or rides without romantic onboarding',async({page})=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));
  await mock(page,{hub:true,incomplete:true});await login(page);
  await expect(page.locator('#screen-modes')).toBeVisible();
  await expect(page.locator('[data-campus-mode]')).toHaveCount(3);
  await page.locator('[data-campus-mode=study]').click();
  await expect(page.locator('#screen-campus')).toBeVisible();
  await expect(page.locator('#activeModeLabel')).toContainText('Estudos');
  await expect(page.locator('#screen-onboarding')).toBeHidden();
  expect(requests.some(u=>u.includes('/profiles?') && u.includes('neq.'))).toBe(false);
  expect(requests.some(u=>u.includes('/swipes?'))).toBe(false);
  await page.reload();await expect(page.locator('#screen-campus')).toBeVisible();
  await expect(page.locator('#activeModeLabel')).toContainText('Estudos');
  await page.locator('#switchMode').click();await page.locator('[data-campus-mode=ride]').click();
  await expect(page.locator('#activeModeLabel')).toContainText('Caronas');
  expect(await page.evaluate(()=>state.userId)).toBe(USER);
  await page.locator('#switchMode').click();await page.locator('[data-campus-mode=dating]').click();
  await expect(page.locator('#screen-onboarding')).toBeVisible();
  await expect(page.locator('#onbBirth')).toHaveValue('2000-06-15');
  await page.locator('#switchMode').click();await expect(page.locator('#screen-modes')).toBeVisible();
});

test('signup with a session opens mode chooser instead of requiring dating',async({page})=>{
  await mock(page,{hub:true,signup:session()});
  await page.locator('[data-tab=register]').click();
  await page.locator('#regName').fill('Nova pessoa');await page.locator('#regEmail').fill('test@example.com');
  await page.locator('#regBirth').fill('2000-06-15');await page.locator('#regPass').fill('password123');
  await page.locator('#registerForm button[type=submit]').click();
  await expect(page.locator('#screen-modes')).toBeVisible();await expect(page.locator('#screen-onboarding')).toBeHidden();
  expect(await page.evaluate(()=>state.user.onboardingComplete)).toBe(false);
});

test('shared account name update writes no romantic preferences and logout closes modes',async({page})=>{
  const writes=await mock(page,{hub:true,incomplete:true});await login(page);
  await page.locator('.mode-account summary').click();await page.locator('#campusAccountName').fill('Nome compartilhado');
  await page.locator('#campusIdentityForm button').click();
  await expect(page.locator('#toastContainer')).toContainText('Nome atualizado nos três modos');
  expect(writes.find(w=>w.path.endsWith('/profiles')&&w.method==='PATCH').body).toEqual({name:'Nome compartilhado'});
  await page.locator('#campusLogout').click();await expect(page.locator('#screen-auth')).toBeVisible();
  await expect(page.locator('#modeBar')).toBeHidden();
});

test('late dating initialization cannot navigate away from another mode',async({page})=>{
  const options={hub:true,matchesDelay:600,matches:true};await mock(page,options);await login(page);
  const loading = page.waitForRequest(request => request.url().includes('/rest/v1/matches?'));
  await page.locator('[data-campus-mode=dating]').click();await loading;
  await page.locator('#switchMode').click();await page.locator('[data-campus-mode=study]').click();
  await page.waitForTimeout(1400);
  await expect(page.locator('#screen-campus')).toBeVisible();
  await expect(page.locator('#activeModeLabel')).toContainText('Estudos');
  await expect(page.locator('#matchModal')).not.toHaveClass(/show/);
  await expect(page.locator('#matchModal')).toHaveCSS('opacity','0');
  expect(await page.evaluate(()=>Object.keys(state.chatSubscriptions))).toEqual([]);
});

test('mode preference is scoped to account and chooser fits a small screen',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await page.addInitScript(()=>localStorage.setItem('spark_mode_another-account','ride'));
  await mock(page,{hub:true});await login(page);await expect(page.locator('#screen-modes')).toBeVisible();
  for(const mode of ['dating','study','ride']) await expect(page.locator(`[data-campus-mode=${mode}]`)).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
