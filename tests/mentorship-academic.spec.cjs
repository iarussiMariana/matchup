const {test,expect}=require('@playwright/test');
const path=require('node:path');
const {catalog}=require('./catalog-fixture.cjs');
const future=()=>new Date(Date.now()+86400000).toISOString();
const session=(overrides={})=>({id:'session-1',request_id:'request-1',title:'Revisão de cálculo',subject:'Cálculo',topic:'Derivadas',starts_at:future(),duration_minutes:60,location:'Biblioteca',format:'presencial',status:'pending',my_response:'pending',is_creator:false,participants:[{id:'me',name:'Ana',response:'pending'}],...overrides});
const group=(overrides={})=>({id:'group-1',name:'Cálculo juntos',subject:'Cálculo',topic:'Derivadas',objective:'Estudar a lista',capacity:6,member_count:2,is_member:false,is_owner:false,status:'open',members:[],messages:[],...overrides});
async function boot(page,data={}){
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
  await page.goto('/');
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="root"></main>');
  await page.addStyleTag({path:path.join(__dirname,'..','mentorship-academic.css')});
  await page.evaluate(data=>{
    window.calls=[];window.destinations=[];window.data=data;
    window.MentorApp={user:{id:'me'},profile:{id:'me'},navigate:v=>window.destinations.push(v),openRequestChat:id=>window.destinations.push('request:'+id),client:{rpc:async(name,args)=>{
      window.calls.push({name,args});const result=window.data[name];if(result?.failure)return {data:null,error:result.failure};return {data:result===undefined?[]:result,error:null};
    }}};
  },data);
  await page.evaluate(catalog=>{window.MentorApp.loadCatalog=async()=>catalog;},catalog);
  await page.addStyleTag({path:path.join(__dirname,'..','mentorship-catalog.css')});
  await page.addScriptTag({path:path.join(__dirname,'..','mentorship-catalog.js')});
  await page.addScriptTag({path:path.join(__dirname,'..','mentorship-calendar.js')});
  await page.addScriptTag({path:path.join(__dirname,'..','mentorship-academic.js')});
}
async function render(page,method,...args){await page.evaluate(({method,args})=>window.MentorAcademic[method](document.getElementById('root'),...args),{method,args});}
test('agenda shows honest empty state and loads no sample meetings',async({page})=>{
  await boot(page,{'mentor_sessions':[]});await render(page,'renderAgenda');await expect(page.getByText('Sua agenda começa aqui')).toBeVisible();await expect(page.getByRole('button',{name:'Novo encontro'})).toBeVisible();await page.getByRole('button',{name:'Novo encontro'}).click();await expect(page.getByText('Conecte-se antes de agendar')).toBeVisible();
});
test('agenda backend failure is actionable and never an empty success',async({page})=>{
  await boot(page,{'mentor_sessions':{failure:{code:'PGRST202'}}});await render(page,'renderAgenda');await expect(page.getByText('Não foi possível carregar')).toBeVisible();await expect(page.getByText('Sua agenda começa aqui')).toHaveCount(0);await page.evaluate(()=>window.data.mentor_sessions=[]);await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByText('Sua agenda começa aqui')).toBeVisible();
});
test('participants can confirm sessions and schedule accepted connections',async({page})=>{
  await boot(page,{'mentor_sessions':[session()],mentor_requests:[{id:'request-1',subject:'Cálculo',status:'accepted',peer:{name:'Bia'}}],mentor_groups:[]});await render(page,'renderAgenda');await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.some(c=>c.name==='mentor_session_respond'&&c.args.p_session==='session-1'&&c.args.p_accept))).toBeTruthy();await page.getByRole('button',{name:'Novo encontro'}).click();await page.getByLabel('Matéria',{exact:true}).selectOption('Cálculo');await page.getByLabel('Local público ou link da reunião').fill('Biblioteca');await page.getByRole('button',{name:'Enviar convite'}).click();await expect.poll(()=>page.evaluate(()=>window.calls.find(c=>c.name==='mentor_session_save')?.args.p_session.request_id)).toBe('request-1');
});
test('group joins and conversation encode untrusted user content',async({page})=>{
  await boot(page,{'mentor_group_detail':group({name:'<img src=x onerror=alert(1)>',is_member:true,members:[{id:'me',name:'Ana',course:'Engenharia'}],messages:[{sender_id:'other',sender_name:'Bia',body:'<script>alert(1)</script>',created_at:future()}]}),mentor_files:[]});await render(page,'renderGroup','group-1');await expect(page.getByText('<script>alert(1)</script>',{exact:true})).toBeVisible();await expect(page.locator('#root script,#root img')).toHaveCount(0);await page.getByLabel('Mensagem',{exact:true}).fill('Olá, pessoal!');await page.getByRole('button',{name:'Enviar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_send')?.args.p_body)).toBe('Olá, pessoal!');
});
test('group message retry retains idempotency key and draft on error',async({page})=>{
  await boot(page,{'mentor_group_detail':group({is_member:true}),mentor_files:[],mentor_group_send:{failure:{code:'network'}}});await render(page,'renderGroup','group-1');await page.getByLabel('Mensagem',{exact:true}).fill('Dúvida de cálculo');await page.getByRole('button',{name:'Enviar',exact:true}).click();await expect(page.getByText(/Não foi possível concluir/)).toBeVisible();await page.getByRole('button',{name:'Enviar',exact:true}).click();const calls=await page.evaluate(()=>window.calls.filter(c=>c.name==='mentor_group_send'));expect(calls.length).toBe(2);expect(calls[0].args.p_client_id).toBe(calls[1].args.p_client_id);await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue('Dúvida de cálculo');
});
test('notifications mark read and open actual conversation',async({page})=>{
  await boot(page,{mentor_notifications:[{id:'notice-1',type:'message',title:'Nova mensagem',body:'Bia enviou uma mensagem',request_id:'request-1',is_read:false,created_at:future()}]});await render(page,'renderNotifications');await page.getByRole('button',{name:/Nova mensagem/}).click();await expect.poll(()=>page.evaluate(()=>window.destinations)).toEqual(['request:request-1']);expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_notification_read').args)).toEqual({p_id:'notice-1'});
});
test('reviews show no invented averages and render real reviews safely',async({page})=>{
  await boot(page,{mentor_reviews:{count:0,average:null,items:[]}});await render(page,'renderReviews','other');await expect(page.getByText('Sem avaliações ainda')).toBeVisible();await page.evaluate(()=>window.data.mentor_reviews={count:1,average:4,items:[{rating:4,reviewer_name:'Bia',comment:'Ótima explicação',created_at:new Date().toISOString()}]});await render(page,'renderReviews','other');await expect(page.getByText('★ 4.0 · 1 avaliações')).toBeVisible();await expect(page.getByText('Ótima explicação')).toBeVisible();
});
test('academic calendar and forms stay within narrow screen',async({page})=>{
  await page.setViewportSize({width:320,height:740});await boot(page,{mentor_sessions:[session()]});await render(page,'renderAgenda');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await render(page,'renderGroups');await page.getByRole('button',{name:'Criar grupo',exact:true}).click();await expect(page.getByLabel('Nome do grupo')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test('calendar selects days and navigates across year boundaries',async({page})=>{
  await boot(page,{mentor_sessions:[]});
  await page.evaluate(()=>window.MentorAcademic.renderAgenda(document.getElementById('root'),new Date(2026,11,31),31));
  await expect(page.locator('[data-day="31"]')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Próximo mês',exact:true}).click();
  await expect(page.getByText('janeiro de 2027',{exact:true})).toBeVisible();
  await page.locator('[data-day="15"]').click();
  await expect(page.locator('[data-day="15"]')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Mês anterior',exact:true}).click();
  await expect(page.getByText('dezembro de 2026',{exact:true})).toBeVisible();
});
test('only server-authorized participants can access review control',async({page})=>{
  const ended=session({status:'confirmed',starts_at:new Date(Date.now()-7200000).toISOString(),can_review:false});
  await boot(page,{mentor_sessions:[ended]});await render(page,'renderAgenda');
  await expect(page.getByRole('button',{name:'Avaliar monitoria'})).toHaveCount(0);
  await page.evaluate(()=>window.data.mentor_sessions[0].can_review=true);await render(page,'renderAgenda');
  await page.getByRole('button',{name:'Avaliar monitoria'}).click();
  await page.getByLabel('Feedback',{exact:true}).fill('Explicação clara');
  await page.getByRole('button',{name:'Enviar avaliação'}).click();
  await expect.poll(()=>page.evaluate(()=>window.calls.find(c=>c.name==='mentor_review')?.args.p_comment)).toBe('Explicação clara');
});
test('mark all notifications calls read only for the unread entries',async({page})=>{
  await boot(page,{mentor_notifications:[{id:'new-1',title:'Convite',body:'Estudo',is_read:false,created_at:future()},{id:'old-1',title:'Anterior',body:'Lida',is_read:true,created_at:future()}]});
  await render(page,'renderNotifications');await page.getByRole('button',{name:'Marcar visíveis como lidas'}).click();
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.name==='mentor_notification_read').map(c=>c.args.p_id))).toEqual(['new-1']);
});
test('blocked group response never exposes chat or uploader',async({page})=>{
  await boot(page,{mentor_group_detail:{failure:{code:'42501'}}});await render(page,'renderGroup','group-1');
  await expect(page.getByText(/Este conteúdo não está disponível/)).toBeVisible();
  await expect(page.getByLabel('Mensagem',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Adicionar material')).toHaveCount(0);
});
for(const [name,event,destination] of [
  ['incoming request',{type:'request',request_id:'request-1'},'requests'],
  ['session',{type:'session',session_id:'session-1'},'agenda'],
  ['group',{type:'invitation',group_id:'group-1'},'group:group-1']
])test(`notification opens the correct ${name} screen`,async({page})=>{
  await boot(page,{mentor_notifications:[{id:'notice-1',title:'Abrir destino',body:'Notificação acadêmica',is_read:false,created_at:future(),...event}]});
  await page.evaluate(()=>window.MentorApp.openGroup=id=>window.destinations.push('group:'+id));
  await render(page,'renderNotifications');await page.getByRole('button',{name:/Abrir destino/}).click();
  await expect.poll(()=>page.evaluate(()=>window.destinations)).toEqual([destination]);
});
test('cleanup prevents stale academic render over another app screen',async({page})=>{
  await boot(page);await page.evaluate(()=>{window.MentorApp.client.rpc=()=>new Promise(resolve=>window.finish=resolve);window.MentorAcademic.renderAgenda(document.getElementById('root'));});
  await page.evaluate(()=>{window.MentorAcademic.cleanup();document.getElementById('root').innerHTML='Minha nova tela';window.finish({data:[],error:null});});
  await expect(page.getByText('Minha nova tela')).toBeVisible();await expect(page.getByText('Sua agenda começa aqui')).toHaveCount(0);
});
test('late response does not repopulate a logged-out screen',async({page})=>{
  await boot(page);await page.evaluate(()=>{window.MentorApp.client.rpc=()=>new Promise(resolve=>window.finish=resolve);window.MentorAcademic.renderAgenda(document.getElementById('root'));});await page.evaluate(()=>{window.MentorApp.user=null;document.getElementById('root').innerHTML='Sessão encerrada';window.finish({data:[],error:null});});await expect(page.getByText('Sessão encerrada')).toBeVisible();await expect(page.getByText('Sua agenda começa aqui')).toHaveCount(0);
});
