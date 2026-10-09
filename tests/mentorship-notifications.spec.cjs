'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const meeting=(overrides={})=>({id:'session-1',title:'Revisão de cálculo',subject:'Cálculo',topic:'Derivadas',starts_at:'2027-10-05T12:30:00Z',duration_minutes:60,location:'Biblioteca',format:'presencial',status:'pending',my_response:'pending',participants:[],updated_at:'2026-10-02T15:00:00Z',...overrides});
const event=(type,id,overrides={})=>({id,type,title:'Evento '+id,body:'Atualização acadêmica',is_read:false,created_at:'2026-10-02T15:00:00Z',...overrides});
async function boot(page,data={}){
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
  await page.goto('/');
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="root"></main>');
  await page.addStyleTag({path:path.join(__dirname,'..','mentorship-academic.css')});
  await page.evaluate(data=>{
    window.data=data;window.calls=[];window.destinations=[];
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
    window.MentorApp={user:{id:'me'},epoch:1,navigate:to=>window.destinations.push(to),openGroup:id=>window.destinations.push('group:'+id),openRequestChat:id=>window.destinations.push('request:'+id),client:{rpc:async(name,args)=>{
      window.calls.push({name,args});const result=window.data[name];
      if(result?.failure)return {data:null,error:result.failure};
      if(name==='mentor_notification_read'){const n=window.data.mentor_notifications.find(n=>n.id===args.p_id);if(n)n.is_read=true;return {data:true,error:null};}
      return {data:structuredClone(result??[]),error:null};
    }}};
  },data);
  await page.addScriptTag({path:path.join(__dirname,'..','mentorship-calendar.js')});
  await page.addScriptTag({path:path.join(__dirname,'..','mentorship-academic.js')});
}
async function render(page,method='renderAgenda'){await page.evaluate(method=>window.MentorAcademic[method](document.getElementById('root')),method);}
async function exported(page,button){const pending=page.waitForEvent('download');await button.click();const download=await pending,stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);return {name:download.suggestedFilename(),text:Buffer.concat(chunks).toString('utf8').replace(/\r\n /g,'')};}
async function nativeBridge(page,mode='success'){
  await page.evaluate(mode=>{
    window.nativeCalls=[];window.nativeFiles={};window.nativeMode=mode;
    const filesystem={
      writeFile:async args=>{window.nativeCalls.push({operation:'write',args});window.nativeFiles[args.path]=args.data;if(mode==='write-failure')throw new Error('Cache unavailable');if(mode==='stale')await new Promise(resolve=>window.finishNativeWrite=resolve);return {uri:'file:///cache/'+args.path};},
      readdir:async args=>{window.nativeCalls.push({operation:'list',args});return {files:[]};},
      deleteFile:async args=>{window.nativeCalls.push({operation:'delete',args});delete window.nativeFiles[args.path];}
    };
    const share={canShare:async()=>({value:mode!=='unavailable'}),share:async args=>{window.nativeCalls.push({operation:'share',args});if(mode==='share-failure')throw new Error('Native sheet rejected');return {};}};
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',isPluginAvailable:()=>mode!=='missing',registerPlugin:name=>{window.nativeCalls.push({operation:'register',name});return name==='Filesystem'?filesystem:share;}};
  },mode);
}
const sessionCalls=page=>page.evaluate(()=>window.calls.filter(c=>c.name==='mentor_sessions').length);
let errors;
test.beforeEach(({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));

test('single calendar export reauthorizes and serializes only the fresh event',async({page})=>{
  await boot(page,{mentor_sessions:[meeting(),meeting({id:'other'})]});await render(page);
  await page.evaluate(()=>{window.data.mentor_sessions[0].starts_at='2027-10-06T15:00:00Z';window.data.mentor_sessions[0].location='Sala 3; ala A, B';});
  const result=await exported(page,page.locator('[data-session="session-1"]').getByRole('button',{name:'Adicionar ao calendário'}));
  expect(result.name).toBe('matchup-encontro.ics');expect(result.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(result.text).toContain('DTSTART:20271006T150000Z');expect(result.text).toContain('LOCATION:Sala 3\\; ala A\\, B');expect(result.text).not.toContain('UID:other@');
  expect(await sessionCalls(page)).toBe(2);await expect(page.getByRole('status')).toContainText('Nenhum evento é adicionado automaticamente');
  await page.getByText('Como usar o calendário',{exact:true}).click();await expect(page.getByText(/No iPhone\/iPad/)).toBeVisible();
});
test('bulk export includes every fresh authorized event, not just selected day, and removes revoked ones',async({page})=>{
  await boot(page,{mentor_sessions:[meeting(),meeting({id:'revoked'})]});await render(page);
  await page.evaluate(()=>window.data.mentor_sessions=[{...window.data.mentor_sessions[0],location:'Online https://private.example.test/file?token=SECRET'}, {...window.data.mentor_sessions[0],id:'cancelled',starts_at:'2027-12-01T12:00:00Z',status:'cancelled'}]);
  const {text,name}=await exported(page,page.getByRole('button',{name:'Exportar agenda',exact:true}));
  expect(name).toBe('matchup-agenda.ics');expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);expect(text).toContain('STATUS:CANCELLED');expect(text).toContain('UID:cancelled@');expect(text).not.toContain('revoked');expect(text).not.toContain('SECRET');
  await expect(page.locator('[data-session="revoked"]')).toHaveCount(0);expect(await sessionCalls(page)).toBe(2);
});
for(const failure of ['permission','offline','removed'])test(`export refuses stale private snapshot after ${failure}`,async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));
  await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.evaluate(failure=>window.data.mentor_sessions=failure==='removed'?[]:{failure:{code:failure==='permission'?'42501':'NETWORK'}},failure);
  await page.getByRole('button',{name:'Adicionar ao calendário'}).click();await expect(page.getByRole('heading',{name:'Não foi possível carregar'})).toBeVisible();
  await expect(page.locator('[data-session]')).toHaveCount(0);expect(downloads).toHaveLength(0);expect(await sessionCalls(page)).toBe(2);
  await page.evaluate(()=>window.data.mentor_sessions=[]);await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByText('Sua agenda começa aqui')).toBeVisible();
});
test('file-capable share is used without claiming a native calendar insertion',async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));
  await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.sharedText=await files[0].text();}});});
  await page.getByRole('button',{name:'Adicionar ao calendário'}).click();await expect(page.getByRole('status')).toContainText('Arquivo compartilhado');
  expect(await page.evaluate(()=>window.sharedText)).toContain('BEGIN:VEVENT');expect(downloads).toHaveLength(0);
});
test('share rejection falls back to download but user cancellation does not',async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));
  await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancelled','AbortError');}});});
  await page.getByRole('button',{name:'Adicionar ao calendário'}).click();await expect(page.getByRole('status')).toContainText('Compartilhamento cancelado');expect(downloads).toHaveLength(0);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{value:async()=>{throw new DOMException('unsupported','NotAllowedError');}}));
  const {text}=await exported(page,page.getByRole('button',{name:'Adicionar ao calendário'}));expect(text).toContain('BEGIN:VCALENDAR');
});
test('mock Capacitor writes a freshly authorized UTF-8 ICS and shares its cache URI without a Blob download',async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));
  await boot(page,{mentor_sessions:[meeting({location:'Online https://private.example.test?token=SECRET'})]});await render(page);await nativeBridge(page);
  await page.evaluate(()=>window.data.mentor_sessions[0].title='Título atualizado');await page.getByRole('button',{name:'Exportar agenda',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Arquivo preparado para a folha de compartilhamento');
  const calls=await page.evaluate(()=>window.nativeCalls),write=calls.find(c=>c.operation==='write').args,share=calls.find(c=>c.operation==='share').args;
  expect(write.directory).toBe('CACHE');expect(write.encoding).toBe('utf8');expect(write.recursive).toBe(true);expect(write.path).toMatch(/^matchup-calendar\/matchup-.*\.ics$/);
  expect(write.data).toContain('BEGIN:VCALENDAR');expect(write.data).toContain('Título atualizado');expect(write.data).not.toContain('SECRET');expect(share.files).toEqual(['file:///cache/'+write.path]);
  expect(calls.filter(c=>c.operation==='delete')).toHaveLength(0);expect(await page.evaluate(()=>Object.keys(window.nativeFiles))).toHaveLength(1);expect(downloads).toHaveLength(0);expect(await sessionCalls(page)).toBe(2);
});
for(const mode of ['missing','unavailable','write-failure','share-failure'])test(`mock Capacitor ${mode} gives an honest failure, cleans unshared files and never downloads a Blob`,async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));await boot(page,{mentor_sessions:[meeting()]});await render(page);await nativeBridge(page,mode);
  await page.getByRole('button',{name:'Adicionar ao calendário'}).click();await expect(page.getByRole('status')).toContainText('O compartilhamento nativo foi cancelado ou não está disponível');
  expect(downloads).toHaveLength(0);expect(await page.evaluate(()=>Object.keys(window.nativeFiles))).toHaveLength(0);
  const calls=await page.evaluate(()=>window.nativeCalls);if(['write-failure','share-failure'].includes(mode))expect(calls.filter(c=>c.operation==='delete')).toHaveLength(1);else expect(calls.filter(c=>c.operation==='write')).toHaveLength(0);
});
test('mock native stale-session write deletes its own unshared file and does not open the chooser',async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));await boot(page,{mentor_sessions:[meeting()]});await render(page);await nativeBridge(page,'stale');
  await page.getByRole('button',{name:'Exportar agenda',exact:true}).click();await page.waitForFunction(()=>!!window.finishNativeWrite);
  await page.evaluate(()=>{window.MentorApp.epoch++;window.MentorApp.user={id:'other'};window.MentorAcademic.cleanup();document.getElementById('root').textContent='Outra conta';window.finishNativeWrite();});
  await expect.poll(()=>page.evaluate(()=>window.nativeCalls.filter(c=>c.operation==='delete').length)).toBe(1);
  expect(await page.evaluate(()=>window.nativeCalls.filter(c=>c.operation==='share'))).toHaveLength(0);expect(await page.evaluate(()=>Object.keys(window.nativeFiles))).toHaveLength(0);expect(downloads).toHaveLength(0);await expect(page.getByText('Outra conta',{exact:true})).toBeVisible();
});
test('native path performs no file operations when fresh RPC authorization is revoked',async({page})=>{
  await boot(page,{mentor_sessions:[meeting()]});await render(page);await nativeBridge(page);
  await page.evaluate(()=>window.data.mentor_sessions={failure:{code:'42501'}});await page.getByRole('button',{name:'Exportar agenda',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Não foi possível carregar'})).toBeVisible();expect(await page.evaluate(()=>window.nativeCalls)).toEqual([]);
});
test('month and day navigation reuse only memory while refresh and mutations refetch',async({page})=>{
  await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.getByRole('button',{name:'Próximo mês',exact:true}).click();await page.locator('[data-day="15"]').click();await page.getByRole('button',{name:'Mês anterior',exact:true}).click();
  expect(await sessionCalls(page)).toBe(1);
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect.poll(()=>sessionCalls(page)).toBe(2);
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect.poll(()=>sessionCalls(page)).toBe(3);
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
});
test('changing accounts invalidates agenda snapshot even for day navigation',async({page})=>{
  await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.evaluate(()=>{window.MentorApp.user={id:'other'};window.data.mentor_sessions=[];});
  await render(page);await expect(page.locator('[data-session]')).toHaveCount(0);expect(await sessionCalls(page)).toBe(2);
});
test('refresh permission loss clears cached agenda and never restores it on retry',async({page})=>{
  await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.evaluate(()=>window.data.mentor_sessions={failure:{code:'42501'}});await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await expect(page.locator('[data-session]')).toHaveCount(0);await page.evaluate(()=>window.data.mentor_sessions=[]);
  await page.getByRole('button',{name:'Tentar novamente'}).click();await page.getByRole('button',{name:'Próximo mês',exact:true}).click();await expect(page.locator('[data-session]')).toHaveCount(0);expect(await sessionCalls(page)).toBe(3);
});
test('epoch changes while export authorization is pending suppress file creation',async({page})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));await boot(page,{mentor_sessions:[meeting()]});await render(page);
  await page.evaluate(()=>window.MentorApp.client.rpc=()=>new Promise(resolve=>window.finish=resolve));await page.getByRole('button',{name:'Exportar agenda',exact:true}).click();
  await page.evaluate(()=>{window.MentorApp.epoch++;window.MentorAcademic.cleanup();document.getElementById('root').textContent='Outra tela';window.finish({data:window.data.mentor_sessions,error:null});});
  await expect(page.getByText('Outra tela',{exact:true})).toBeVisible();expect(downloads).toHaveLength(0);
});
test('academic reads time out after 20 seconds with a retry instead of hanging',async({page})=>{
  await boot(page);await page.clock.install();
  await page.evaluate(()=>{window.MentorApp.client.rpc=()=>new Promise(()=>{});window.MentorAcademic.renderAgenda(document.getElementById('root'));});
  await page.clock.fastForward(20001);await expect(page.getByText(/O servidor demorou a responder/)).toBeVisible();await expect(page.getByRole('button',{name:'Tentar novamente'})).toBeVisible();
});

test('notification filters expose real categories and mark only the visible unread subset',async({page})=>{
  const events=[event('request','req',{request_id:'r'}),event('accepted','accepted'),event('message','msg',{request_id:'r'}),event('message','old',{is_read:true}),event('invitation','invite',{group_id:'g'}),event('group_message','group'),event('file','file'),event('session','session'),event('upcoming','upcoming')];
  await boot(page,{mentor_notifications:events});await render(page,'renderNotifications');
  await expect(page.getByLabel('Categoria')).toContainText('Pedidos');await expect(page.getByLabel('Categoria')).toContainText('Lembretes');
  await page.getByLabel('Categoria').selectOption('message');await page.getByLabel('Leitura').selectOption('unread');
  await expect(page.locator('[data-notification]')).toHaveCount(1);await expect(page.locator('[data-notification="msg"]')).toBeVisible();
  await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();await expect(page.getByText('Nenhuma notificação neste filtro')).toBeVisible();
  expect(await page.evaluate(()=>window.calls.filter(c=>c.name==='mentor_notification_read').map(c=>c.args.p_id))).toEqual(['msg']);
  await page.getByLabel('Categoria').selectOption('request');await expect(page.locator('[data-notification="req"]')).toBeVisible();
  await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();await page.getByLabel('Leitura').selectOption('all');
  await expect(page.locator('[data-notification="req"]')).toContainText('Lida');await expect(page.locator('[data-notification="req"]')).toContainText('Resposta pendente');
  await page.locator('[data-notification="req"]').click();expect(await page.evaluate(()=>window.destinations)).toEqual(['requests']);
});
test('notification read failure is retryable, preserving the filter and unread state',async({page})=>{
  await boot(page,{mentor_notifications:[event('file','file',{request_id:'r'}),event('message','msg')],mentor_notification_read:{failure:{code:'NETWORK'}}});await render(page,'renderNotifications');
  await page.getByLabel('Categoria').selectOption('file');await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();await expect(page.getByRole('status')).toContainText('Não foi possível concluir');
  await expect(page.locator('[data-notification="file"]')).toContainText('Não lida');await expect(page.getByLabel('Categoria')).toHaveValue('file');
  await page.evaluate(()=>delete window.data.mentor_notification_read);await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();await expect(page.locator('[data-notification="file"]')).not.toHaveClass('unread');
});
test('partial mark-visible failure retries only remaining unread IDs',async({page})=>{
  await boot(page,{mentor_notifications:[event('message','first'),event('message','second'),event('file','hidden')]});await render(page,'renderNotifications');
  await page.getByLabel('Categoria').selectOption('message');
  await page.evaluate(()=>{const original=window.MentorApp.client.rpc;window.MentorApp.client.rpc=(name,args)=>{if(name==='mentor_notification_read'&&args.p_id==='second'&&!window.allowSecond){window.calls.push({name,args});return Promise.resolve({data:null,error:{code:'NETWORK'}});}return original(name,args);};});
  await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();await expect(page.getByRole('status')).toContainText('Não foi possível concluir');
  await expect(page.locator('[data-notification="first"]')).not.toHaveClass('unread');await expect(page.locator('[data-notification="second"]')).toHaveClass('unread');
  await page.evaluate(()=>window.allowSecond=true);await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();await expect(page.getByRole('status')).toContainText('Notificações visíveis marcadas');
  expect(await page.evaluate(()=>window.calls.filter(c=>c.name==='mentor_notification_read').map(c=>c.args.p_id))).toEqual(['first','second','second']);
});
test('academic mutation timeout warns about uncertain commit and does not retry automatically',async({page})=>{
  await boot(page,{mentor_sessions:[meeting()]});await render(page);await page.clock.install();
  await page.evaluate(()=>{const original=window.MentorApp.client.rpc;window.MentorApp.client.rpc=(name,args)=>{if(name==='mentor_session_respond'){window.calls.push({name,args});return new Promise(()=>{});}return original(name,args);};});
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.clock.fastForward(20001);
  await expect(page.getByRole('status')).toContainText('A alteração pode ter sido salva');
  expect(await page.evaluate(()=>window.calls.filter(c=>c.name==='mentor_session_respond').length)).toBe(1);
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect.poll(()=>sessionCalls(page)).toBe(2);
});
test('notification load retry and refreshed empty category do not navigate to unrelated chat',async({page})=>{
  await boot(page,{mentor_notifications:{failure:{code:'NETWORK'}}});await render(page,'renderNotifications');await expect(page.getByRole('button',{name:'Tentar novamente'})).toBeVisible();
  await page.evaluate(()=>window.data.mentor_notifications=[{id:'unknown',type:'other',title:'Sem destino',is_read:true}]);await page.getByRole('button',{name:'Tentar novamente'}).click();
  await page.getByLabel('Categoria').selectOption('other');await page.getByRole('button',{name:/Sem destino/}).click();await expect(page.getByRole('status')).toContainText('Não há um destino disponível');expect(await page.evaluate(()=>window.destinations)).toEqual([]);
  await page.evaluate(()=>window.data.mentor_notifications=[]);await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect(page.getByText('Tudo em dia',{exact:true})).toBeVisible();await expect(page.getByLabel('Categoria')).toHaveValue('other');
});
for(const [type,fields,target] of [['message',{request_id:'r'},'request:r'],['invitation',{group_id:'g'},'group:g'],['group_message',{group_id:'g'},'group:g'],['file',{request_id:'r'},'request:r'],['session',{session_id:'s'},'agenda'],['upcoming',{session_id:'s'},'agenda']])test(`filtered ${type} notification retains its actionable destination`,async({page})=>{
  await boot(page,{mentor_notifications:[event(type,'one',fields)]});await render(page,'renderNotifications');await page.getByLabel('Categoria').selectOption(type);await page.getByRole('button',{name:/Evento one/}).click();expect(await page.evaluate(()=>window.destinations)).toEqual([target]);
});
