const {test,expect}=require('@playwright/test');
const path=require('node:path');
const {catalog}=require('./catalog-fixture.cjs');
const {setup,profile,USER}=require('./mentorship-fixture.cjs');
const CODE='0123456789ABCDEF0123456789ABCDEF';
const group=(extra={})=>({id:'group-1',owner_id:'me',name:'Cálculo juntos',subject:'Cálculo',topic:'Derivadas',objective:'Estudar a lista',capacity:12,member_count:2,is_member:true,is_owner:true,status:'open',visibility:'private',enrollment_open:true,format:'online',location:'https://meet.example.invalid/private',members:[{id:'me',name:'Ana',course:'Computação'},{id:'other',name:'Bia',course:'Engenharia'}],messages:[],...extra});
async function boot(page,data={}){
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await page.goto('/');
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="root"></main>');
  for(const file of ['mentorship.css','mentorship-academic.css','mentorship-catalog.css'])await page.addStyleTag({path:path.join(__dirname,'..',file)});
  await page.evaluate(({data,catalog})=>{
    window.calls=[];window.destinations=[];window.data={mentor_groups:[],mentor_files:[],mentor_sessions:[],...data};
    window.MentorApp={user:{id:'me'},profile:{id:'me'},epoch:1,loadCatalog:async()=>catalog,navigate:v=>window.destinations.push(v),client:{rpc:async(name,args)=>{window.calls.push({name,args});const value=window.data[name];if(value?.failure)return {data:null,error:value.failure};return {data:value===undefined?[]:value,error:null};}}};
  },{data,catalog});
  for(const file of ['mentorship-catalog.js','mentorship-calendar.js','mentorship-academic.js'])await page.addScriptTag({path:path.join(__dirname,'..',file)});
}
async function render(page,method='renderGroup',...args){await page.evaluate(({method,args})=>window.MentorAcademic[method](document.getElementById('root'),...args),{method,args});}
async function section(page,name){await page.getByText(name,{exact:true}).filter({has:page.locator('xpath=self::summary')}).click();}
let errors;
test.beforeEach(({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));

test('typed invitation normalizes case, spaces and hyphens then opens joined group',async({page})=>{
  await boot(page,{mentor_group_join_code:group(),mentor_group_detail:group()});await render(page,'renderGroups');
  await page.getByRole('button',{name:'Entrar com código',exact:true}).click();
  await page.getByLabel('Código do convite').fill(CODE.toLowerCase().match(/.{1,4}/g).join(' - '));
  await page.getByRole('button',{name:'Entrar no grupo',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cálculo juntos'})).toBeVisible();
  expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_join_code').args)).toEqual({p_code:CODE});
});
test('invitation validation and server failure preserve draft with no false success',async({page})=>{
  await boot(page,{mentor_group_join_code:{failure:{code:'42501'}}});await render(page,'renderGroups');
  await page.getByRole('button',{name:'Entrar com código',exact:true}).click();await page.getByLabel('Código do convite').fill('ABC');
  await page.getByRole('button',{name:'Entrar no grupo',exact:true}).click();await expect(page.getByText(/Confira o código completo/)).toBeVisible();
  expect(await page.evaluate(()=>window.calls.some(c=>c.name==='mentor_group_join_code'))).toBe(false);
  await page.getByLabel('Código do convite').fill(CODE);await page.getByRole('button',{name:'Entrar no grupo',exact:true}).click();
  await expect(page.getByLabel('Código do convite')).toHaveValue(CODE);await expect(page.getByText(/Este conteúdo não está disponível/)).toBeVisible();
});
test('new group defaults private and twelve including owner; complete configuration is submitted',async({page})=>{
  await boot(page,{mentor_group_create:{failure:{code:'network'}}});await render(page,'renderGroups');await page.getByRole('button',{name:'Criar grupo',exact:true}).click();
  await expect(page.getByLabel('Máximo de participantes')).toHaveValue('12');await expect(page.getByLabel('Visibilidade')).toHaveValue('private');
  await page.getByLabel('Nome do grupo').fill('Meu grupo');await page.getByLabel('Descrição e objetivo').fill('Resolver exercícios');
  await page.locator('#groupSubject summary').click();await page.getByRole('radio',{name:'Cálculo',exact:true}).check();
  await page.locator('[data-group-options=access]>summary').click();await page.locator('[data-group-options=planning]>summary').click();
  await page.getByLabel('Máximo de participantes').fill('100');await page.getByLabel('Formato do grupo').selectOption('online');
  await page.getByLabel('Local ou link do grupo').fill('https://meet.example.invalid/study');await page.getByRole('button',{name:'Criar grupo',exact:true}).last().click();
  await expect(page.getByText(/Não foi possível concluir/)).toBeVisible();await expect(page.getByLabel('Nome do grupo')).toHaveValue('Meu grupo');
  expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_create').args.p_group)).toMatchObject({name:'Meu grupo',subject:'Cálculo',capacity:100,visibility:'private',enrollment_open:true,format:'online',location:'https://meet.example.invalid/study'});
});
test('owner edits complete hub without exposing settings/code to ordinary members',async({page})=>{
  await boot(page,{mentor_group_detail:group(),mentor_group_update:{failure:{code:'22023'}}});await render(page,'renderGroup','group-1');
  await section(page,'Configurações do grupo');await page.getByLabel('Nome do grupo').fill('Novo nome');await page.locator('[data-group-options=access]>summary').click();await page.getByLabel('Inscrições',{exact:true}).selectOption('false');
  await page.getByRole('button',{name:'Salvar configurações'}).click();await expect(page.getByLabel('Nome do grupo')).toHaveValue('Novo nome');
  expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_update').args)).toMatchObject({p_group:'group-1',p_changes:{name:'Novo nome',subject:'Cálculo',enrollment_open:false,capacity:12}});
  await page.evaluate(()=>window.data.mentor_group_detail.is_owner=false);await render(page,'renderGroup','group-1');
  await expect(page.getByText('Configurações do grupo',{exact:true})).toHaveCount(0);await expect(page.getByText('Convites e código de acesso',{exact:true})).toHaveCount(0);
});
test('essential fields create a group without opening advanced sections',async({page})=>{
  await boot(page,{mentor_group_create:group(),mentor_group_detail:group()});await render(page,'renderGroups');await page.getByRole('button',{name:'Criar grupo',exact:true}).click();
  await expect(page.locator('[data-group-options][open]')).toHaveCount(0);
  for(const label of ['Nome do grupo','Assunto','Descrição e objetivo'])await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  await expect(page.getByLabel('Máximo de participantes')).toBeHidden();await expect(page.getByLabel('Local ou link do grupo')).toBeHidden();
  await expect(page.locator('[data-group-options=access]>summary')).toContainText('12 participantes · Privado · Inscrições abertas');
  await page.getByLabel('Nome do grupo').fill('Essencial');await page.getByRole('button',{name:'Criar grupo',exact:true}).last().click();
  await expect(page.getByText('Selecione uma disciplina do catálogo.',{exact:true})).toBeVisible();await expect(page.locator('#groupSubject details')).toHaveAttribute('open','');
  await page.getByRole('radio',{name:'Cálculo',exact:true}).check();await page.getByRole('button',{name:'Criar grupo',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Cálculo juntos'})).toBeVisible();
  expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_create').args.p_group)).toEqual({name:'Essencial',topic:'',objective:'',subject:'Cálculo',capacity:12,visibility:'private',enrollment_open:true,format:'presencial',location:'',starts_at:null,needs_mentor:false});
  await render(page,'renderGroups');await page.getByRole('button',{name:'Criar grupo',exact:true}).click();await expect(page.getByLabel('Nome do grupo')).toHaveValue('');
});
for(const value of ['', '1', '101'])test(`native validation reveals collapsed required capacity (${value||'empty'}) and focuses it`,async({page})=>{
  const consoleErrors=[];page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  await boot(page,{mentor_group_detail:group(),mentor_group_update:{failure:{code:'network'}}});await render(page,'renderGroup','group-1');await section(page,'Configurações do grupo');
  await page.locator('[data-group-options=access]>summary').click();await page.getByLabel('Máximo de participantes').fill(value);await page.locator('[data-group-options=access]>summary').click();
  await render(page,'renderGroup','group-1');await section(page,'Configurações do grupo');await expect(page.getByLabel('Máximo de participantes')).toHaveValue(value);await expect(page.locator('[data-group-options][open]')).toHaveCount(0);
  await section(page,'Configurações do grupo');
  await page.locator('.academic-group-settings form').evaluate(form=>form.requestSubmit());
  await expect(page.locator('[data-section=settings]')).toHaveAttribute('open','');await expect(page.locator('[data-group-options=access]')).toHaveAttribute('open','');await expect(page.getByLabel('Máximo de participantes')).toBeFocused();
  expect(await page.evaluate(()=>window.calls.some(c=>c.name==='mentor_group_update'))).toBe(false);expect(consoleErrors).toEqual([]);
  await page.getByLabel('Máximo de participantes').fill('8');await page.locator('[data-group-options=access]>summary').click();await page.getByRole('button',{name:'Salvar configurações'}).click();
  await expect(page.getByText(/Não foi possível concluir/)).toBeVisible();expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_update').args.p_changes.capacity)).toBe(8);
});
test('group drafts restore optional values, subject and summaries after switching forms',async({page})=>{
  await boot(page,{mentor_group_create:{failure:{code:'network'}}});await render(page,'renderGroups');await page.getByRole('button',{name:'Criar grupo',exact:true}).click();
  await page.getByLabel('Nome do grupo').fill('Rascunho');await page.locator('#groupSubject summary').click();await page.getByRole('radio',{name:'Cálculo',exact:true}).check();
  await page.locator('[data-group-options=access]>summary').click();await page.getByLabel('Máximo de participantes').fill('8');await page.getByLabel('Visibilidade').selectOption('public');await page.getByLabel('Inscrições',{exact:true}).selectOption('false');
  await page.locator('[data-group-options=planning]>summary').click();await page.getByLabel('Formato do grupo').selectOption('hibrido');await page.getByLabel('Local ou link do grupo').fill('Biblioteca');await page.getByLabel('Horário preferencial').fill('2030-01-15T10:00');await page.getByLabel('Buscamos um monitor').check();
  await page.getByRole('button',{name:'Entrar com código',exact:true}).click();await page.getByRole('button',{name:'Criar grupo',exact:true}).click();
  await expect(page.locator('[data-group-options][open]')).toHaveCount(0);await expect(page.getByLabel('Nome do grupo')).toHaveValue('Rascunho');await expect(page.locator('#groupSubject .catalog-chips')).toContainText('Cálculo');
  await expect(page.locator('[data-group-options=access]>summary')).toContainText('8 participantes · Público · Inscrições fechadas');await expect(page.locator('[data-group-options=planning]>summary')).toContainText('Híbrido · Local ou link definido · Horário definido · Buscamos um monitor');
  await page.getByRole('button',{name:'Criar grupo',exact:true}).last().click();await expect(page.getByText(/Não foi possível concluir/)).toBeVisible();
  expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_create').args.p_group)).toMatchObject({name:'Rascunho',subject:'Cálculo',capacity:8,visibility:'public',enrollment_open:false,format:'hibrido',location:'Biblioteca',needs_mentor:true});
  await page.locator('[data-group-options=planning]>summary').click();await expect(page.getByLabel('Horário preferencial')).toHaveValue('2030-01-15T10:00');await expect(page.getByLabel('Buscamos um monitor')).toBeChecked();
});
test('persisted settings stay visible in summaries and failed validation reveals configuration',async({page})=>{
  const starts_at='2030-01-15T10:00:12.000Z';
  await boot(page,{mentor_group_detail:group({capacity:20,visibility:'public',enrollment_open:false,needs_mentor:true,starts_at}),mentor_group_update:{failure:{code:'22023'}}});await render(page,'renderGroup','group-1');await section(page,'Configurações do grupo');
  await expect(page.locator('[data-group-options][open]')).toHaveCount(0);await expect(page.locator('[data-group-options=access]>summary')).toContainText('20 participantes · Público · Inscrições fechadas');await expect(page.locator('[data-group-options=planning]>summary')).toContainText('Online · Local ou link definido · Horário definido · Buscamos um monitor');
  await page.getByLabel('Nome do grupo').fill('Configuração mantida');await page.getByRole('button',{name:'Salvar configurações'}).click();await expect(page.getByText(/Confira os campos/)).toBeVisible();await expect(page.locator('[data-group-options][open]')).toHaveCount(2);
  const changes=await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_update').args.p_changes);expect(changes).not.toHaveProperty('starts_at');expect(changes).toMatchObject({capacity:20,visibility:'public',enrollment_open:false,needs_mentor:true,format:'online'});
  await render(page,'renderGroup','group-1');await section(page,'Configurações do grupo');await expect(page.getByLabel('Nome do grupo')).toHaveValue('Configuração mantida');await expect(page.locator('[data-group-options][open]')).toHaveCount(0);
});
test('owner gets, copies, rotates and disables invitation only after confirmation',async({page})=>{
  await boot(page,{mentor_group_detail:group(),mentor_group_code:{code:CODE,enabled:true}});
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text},configurable:true});});
  await render(page,'renderGroup','group-1');await section(page,'Convites e código de acesso');await expect(page.getByLabel('Código de convite')).toHaveValue(CODE.match(/.{1,4}/g).join('-'));
  await page.getByRole('button',{name:'Copiar código'}).click();await expect(page.getByText('Código copiado.')).toBeVisible();
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Renovar código'}).click();expect(await page.evaluate(()=>window.calls.some(c=>c.args?.p_action==='rotate'))).toBe(false);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Renovar código'}).click();await expect.poll(()=>page.evaluate(()=>window.calls.some(c=>c.args?.p_action==='rotate'))).toBe(true);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Desativar convite'}).click();await expect.poll(()=>page.evaluate(()=>window.calls.some(c=>c.args?.p_action==='disable'))).toBe(true);
});
test('member removal and archive require explicit confirmation',async({page})=>{
  await boot(page,{mentor_group_detail:group()});await render(page,'renderGroup','group-1');await section(page,'Participantes (2)');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Remover Bia'}).click();expect(await page.evaluate(()=>window.calls.some(c=>c.name==='mentor_group_remove'))).toBe(false);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remover Bia'}).click();await expect.poll(()=>page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_remove')?.args)).toEqual({p_group:'group-1',p_user:'other'});
  await section(page,'Arquivar grupo');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Arquivar grupo',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.some(c=>c.name==='mentor_group_cancel'))).toBe(true);
});
test('meetings hub preloads private group format/location and saves real agenda session',async({page})=>{
  await boot(page,{mentor_group_detail:group()});await render(page,'renderGroup','group-1');await section(page,'Encontros e agenda');await page.getByRole('button',{name:'Agendar estudo'}).click();
  await expect(page.getByLabel('Formato',{exact:true})).toHaveValue('online');await expect(page.getByLabel('Local público ou link da reunião')).toHaveValue('https://meet.example.invalid/private');
  await page.getByRole('button',{name:'Enviar convite',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.find(c=>c.name==='mentor_session_save')?.args.p_session)).toMatchObject({group_id:'group-1',subject:'Cálculo',format:'online',location:'https://meet.example.invalid/private'});
});
test('closed/full public groups have no join control or private metadata',async({page})=>{
  await boot(page,{mentor_group_detail:group({is_owner:false,is_member:false,location:undefined,members:[],visibility:'public',enrollment_open:false})});await render(page,'renderGroup','group-1');
  await expect(page.getByRole('button',{name:'Participar',exact:true})).toHaveCount(0);await expect(page.getByLabel('Mensagem',{exact:true})).toHaveCount(0);await expect(page.getByText(/https:\/\/meet/)).toHaveCount(0);
  await page.evaluate(()=>{window.data.mentor_group_detail.enrollment_open=true;window.data.mentor_group_detail.member_count=12;});await render(page,'renderGroup','group-1');await expect(page.getByText('Grupo completo',{exact:true})).toBeVisible();
});
test('late code and join results cannot replace a newer navigation/epoch',async({page})=>{
  await boot(page,{mentor_group_detail:group()});await render(page,'renderGroup','group-1');
  await page.evaluate(()=>{window.MentorApp.client.rpc=()=>new Promise(resolve=>window.finish=resolve);});await section(page,'Convites e código de acesso');
  await page.waitForFunction(()=>!!window.finish);await page.evaluate(()=>{window.MentorApp.epoch++;document.getElementById('root').innerHTML='Outra tela';window.finish({data:{code:'SECRET',enabled:true},error:null});});
  await expect(page.getByText('Outra tela')).toBeVisible();await expect(page.getByText('SECRET')).toHaveCount(0);
});
test('changing the group form discards stale join results and stale catalog loading',async({page})=>{
  await boot(page);await render(page,'renderGroups');await page.getByRole('button',{name:'Entrar com código',exact:true}).click();
  await page.evaluate(()=>{window.MentorApp.client.rpc=()=>new Promise(resolve=>window.finish=resolve);});await page.getByLabel('Código do convite').fill(CODE);await page.getByRole('button',{name:'Entrar no grupo',exact:true}).click();
  await page.waitForFunction(()=>!!window.finish);await page.getByRole('button',{name:'Criar grupo',exact:true}).click();await expect(page.getByLabel('Nome do grupo')).toBeVisible();
  await page.evaluate(()=>window.finish({data:{id:'stale'},error:null}));await expect(page.getByLabel('Nome do grupo')).toBeVisible();
  await page.evaluate(()=>{window.MentorApp.loadCatalog=()=>new Promise(resolve=>window.finishCatalog=resolve);});await page.getByRole('button',{name:'Criar grupo',exact:true}).first().click();await page.waitForFunction(()=>!!window.finishCatalog);
  await page.getByRole('button',{name:'Entrar com código',exact:true}).click();await page.evaluate(catalog=>window.finishCatalog(catalog),catalog);await expect(page.getByLabel('Código do convite')).toBeVisible();
});
test('meeting reschedule uses current group subject and retains failed edits',async({page})=>{
  const session={id:'session-1',group_id:'group-1',subject:'Matéria anterior',title:'Encontro',starts_at:new Date(Date.now()+86400000).toISOString(),duration_minutes:60,status:'pending',is_creator:true,my_response:'pending',format:'online',location:'Biblioteca',participants:[]};
  await boot(page,{mentor_group_detail:group(),mentor_sessions:[session],mentor_session_save:{failure:{code:'22023'}}});await render(page,'renderGroup','group-1');await section(page,'Encontros e agenda');await page.getByRole('button',{name:'Remarcar',exact:true}).click();
  await expect(page.getByLabel('Matéria',{exact:true})).toHaveValue('Cálculo');await page.getByLabel('Título',{exact:true}).fill('Novo título');await page.getByRole('button',{name:'Salvar novo horário'}).click();await expect(page.getByLabel('Título',{exact:true})).toHaveValue('Novo título');
  expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_session_save').args.p_session)).toMatchObject({id:'session-1',group_id:'group-1',subject:'Cálculo',title:'Novo título'});
  await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.find(c=>c.name==='mentor_session_respond')?.args)).toEqual({p_session:'session-1',p_accept:true});
});
test('member voluntary leave requires confirmation and returns to groups',async({page})=>{
  await boot(page,{mentor_group_detail:group({is_owner:false})});await render(page,'renderGroup','group-1');await section(page,'Sair do grupo');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Sair do grupo',exact:true}).click();expect(await page.evaluate(()=>window.calls.some(c=>c.name==='mentor_group_leave'))).toBe(false);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Sair do grupo',exact:true}).click();await expect(page.getByRole('heading',{name:'Grupos de estudo',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.calls.find(c=>c.name==='mentor_group_leave').args)).toEqual({p_group:'group-1'});
});
test('group forms, members and code remain in bounds at 320px and 200% text',async({page})=>{
  await page.setViewportSize({width:320,height:568});await boot(page,{mentor_group_detail:group({name:'GrupoSemEspaços'.repeat(6)}),mentor_group_code:{code:CODE,enabled:true}});await render(page,'renderGroup','group-1');
  await page.addStyleTag({content:'html{font-size:200%!important}'});
  await section(page,'Configurações do grupo');await expect(page.getByLabel('Nome do grupo')).toBeVisible();await page.locator('[data-group-options=access]>summary').click();await page.locator('[data-group-options=planning]>summary').click();await section(page,'Convites e código de acesso');await expect(page.getByLabel('Código de convite')).toBeVisible();await section(page,'Participantes (2)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const targets=await page.locator('.academic-view button:visible').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().height));expect(targets.every(height=>height>=44)).toBe(true);
});
test('real shell opens group hub and keeps fixed navigation above safe content at 320px',async({page})=>{
  await page.setViewportSize({width:320,height:568});const g=group({id:'66666666-6666-4666-8666-666666666666',owner_id:USER,members:[{id:USER,name:'Ana',course:'Engenharia'}]});
  await setup(page,{own:profile(),db:{addonResponses:{mentor_groups:[g],mentor_group_detail:g,mentor_files:[],mentor_sessions:[],mentor_reviews:{count:0,average:null,items:[]},mentor_notifications:[],mentor_group_code:{code:CODE,enabled:true}}}});
  await page.waitForFunction(()=>window.MentorApp?.profile&&window.MentorApp.view==='home');await page.evaluate(()=>window.MentorApp.navigate('groups'));
  await page.getByRole('button',{name:'Ver grupo',exact:true}).click();await expect(page.getByRole('heading',{name:'Cálculo juntos'})).toBeVisible();await section(page,'Convites e código de acesso');await expect(page.getByLabel('Código de convite')).toBeVisible();
  await page.addStyleTag({content:'html{font-size:200%!important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const nav=page.getByRole('navigation');expect(await nav.evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
  await section(page,'Arquivar grupo');const button=page.getByRole('button',{name:'Arquivar grupo',exact:true});await button.scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));const b=await button.boundingBox(),n=await nav.boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(n.y+1);
  await nav.getByRole('button',{name:'Início',exact:true}).click();await expect(page.getByLabel('Código de convite')).toHaveCount(0);
});
