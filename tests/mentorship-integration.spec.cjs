const {test,expect}=require('@playwright/test');
const {setup,profile,request,USER,PEER,REQUEST}=require('./mentorship-fixture.cjs');
const next=()=>new Date(Date.now()+86400000).toISOString();
const own=()=>profile({institution:'FACENS',city:'Sorocaba',current_subjects:['Cálculo'],subjects:['Programação']});
const meeting=(overrides={})=>({id:'55555555-5555-4555-8555-555555555555',request_id:REQUEST,title:'Estudo de cálculo',subject:'Cálculo',topic:'Derivadas',starts_at:next(),duration_minutes:60,status:'confirmed',my_response:'confirmed',format:'presencial',location:'Biblioteca',participants:[{id:USER,name:'Estudante',response:'confirmed'},{id:PEER,name:'Ana Oliveira',response:'confirmed'}],...overrides});
const group={id:'66666666-6666-4666-8666-666666666666',name:'Cálculo em grupo',subject:'Cálculo',topic:'Derivadas',objective:'Estudar juntos',capacity:6,member_count:2,is_member:true,is_owner:false,status:'open',members:[{id:USER,name:'Estudante',course:'Computação'}],messages:[]};
const baseResponses=()=>({mentor_sessions:[],mentor_reviews:{count:0,average:null,items:[]},mentor_notifications:[],mentor_groups:[group],mentor_files:[],mentor_group_detail:group});
async function launch(page,responses={},options={}){const result=await setup(page,{own:own(),...options,db:{addonResponses:{...baseResponses(),...responses},...options.db}});await page.waitForFunction(()=>window.MentorApp?.profile&&window.MentorApp.view==='home');return result;}
async function nav(page,name){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();}
let errors;
test.beforeEach(({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));

test('real addon populates Home metrics and opens the agenda through the shell',async({page})=>{
  await launch(page,{mentor_sessions:[meeting(),meeting({id:'past',starts_at:new Date(Date.now()-7200000).toISOString()})],mentor_reviews:{count:2,average:4.5,items:[]}});
  await expect(page.locator('#homeSessionCount')).toHaveText('1');await expect(page.locator('#homeRating')).toHaveText('4,5');
  await expect(page.locator('#academicHome')).toContainText('Derivadas');await expect(page.locator('#academicHome')).toContainText('Ana Oliveira');
  await page.getByRole('button',{name:'Ver agenda',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Agenda',exact:true})).toBeVisible();await expect(page.getByRole('navigation').getByRole('button',{name:'Agenda',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.locator('[data-session]')).toHaveCount(2);
});

test('incoming notification opens acceptance instead of a locked conversation',async({page})=>{
  const incoming=request({direction:'incoming',learner_id:PEER,mentor_id:USER});
  const {db}=await launch(page,{mentor_notifications:[{id:'request:'+REQUEST,type:'request',title:'Pedido de monitoria',body:'Ana quer estudar',request_id:REQUEST,is_read:false,created_at:next()}]},{requests:[incoming]});
  await page.evaluate(()=>window.MentorApp.navigate('notifications'));await page.getByRole('button',{name:/Pedido de monitoria/}).click();
  await expect(page.getByRole('button',{name:'Aceitar',exact:true})).toBeVisible();
  expect(db.calls.some(c=>c.name==='mentor_notification_read'&&c.body.p_id==='request:'+REQUEST)).toBeTruthy();
  await expect(page.getByLabel('Sua mensagem',{exact:true})).toHaveCount(0);
});

test('group notification opens its private conversation and permits returning Home',async({page})=>{
  await launch(page,{mentor_notifications:[{id:'group-message:1',type:'group_message',title:'Conversa do grupo',body:'Novo estudo',group_id:group.id,is_read:false,created_at:next()}]});
  await page.evaluate(()=>window.MentorApp.navigate('notifications'));await page.getByRole('button',{name:/Conversa do grupo/}).click();
  await expect(page.getByRole('heading',{name:'Cálculo em grupo',exact:true})).toBeVisible();
  await expect(page.getByLabel('Mensagem',{exact:true})).toBeVisible();expect(await page.evaluate(()=>window.MentorApp.view)).toBe('groups');
  await nav(page,'Início');await expect(page.locator('#homeSessionCount')).toHaveText('0');await expect(page.getByLabel('Mensagem',{exact:true})).toHaveCount(0);
});

test('accepted chat integrates scheduling and private file upload',async({page})=>{
  const fileId='77777777-7777-4777-8777-777777777777';
  const {db}=await launch(page,{mentor_file_prepare:{id:fileId,path:USER+'/notes.pdf',bucket:'mentor-materials'},mentor_file_commit:{id:fileId}},{requests:[request({status:'accepted'})]});
  await page.waitForFunction(()=>window.MentorApp?.profile);await page.evaluate(id=>window.MentorApp.openRequestChat(id),REQUEST);
  await expect(page.getByLabel('Sua mensagem',{exact:true})).toBeVisible();await expect(page.getByLabel('Adicionar material')).toBeVisible();
  await page.getByRole('button',{name:'Agendar monitoria',exact:true}).click();await page.getByLabel('Matéria',{exact:true}).selectOption('Cálculo');await page.getByLabel('Local público ou link da reunião').fill('Biblioteca');await page.getByRole('button',{name:'Enviar convite',exact:true}).click();
  await expect.poll(()=>db.calls.find(c=>c.name==='mentor_session_save')?.body.p_session.request_id).toBe(REQUEST);
  await page.getByLabel('Adicionar material').setInputFiles({name:'notes.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});await page.getByRole('button',{name:'Enviar arquivo',exact:true}).click();
  await expect(page.getByText('Arquivo compartilhado com os participantes.')).toBeVisible();
  expect(db.calls.find(c=>c.name==='mentor_file_prepare').body.p_request).toBe(REQUEST);expect(db.uploads.some(u=>u.path.includes('/mentor-materials/'))).toBeTruthy();expect(db.calls.some(c=>c.name==='mentor_file_commit')).toBeTruthy();
});

test('late agenda response cannot replace the profile after navigation',async({page})=>{
  await launch(page,{}, {delays:{mentor_sessions:500}});await page.waitForFunction(()=>window.MentorApp?.profile);
  await nav(page,'Agenda');await expect(page.getByRole('heading',{name:'Agenda',exact:true})).toBeVisible();await nav(page,'Perfil');
  await page.waitForTimeout(750);expect(await page.evaluate(()=>window.MentorApp.view)).toBe('profile');await expect(page.locator('.academic-calendar')).toHaveCount(0);
});

for(const viewport of [{width:320,height:568},{width:812,height:375}])test(`academic long text keeps fixed navigation and bottom controls clear at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);
  const long='DisciplinaSemEspaços'.repeat(4);
  await launch(page,{mentor_sessions:Array.from({length:12},(_,i)=>meeting({id:'stress-'+i,title:long,subject:long,topic:long,location:long})),mentor_notifications:[{id:'long:1',type:'session',title:long,body:long,is_read:false,created_at:next()}]});
  await nav(page,'Agenda');await expect(page.locator('[data-session]')).toHaveCount(12);
  await page.addStyleTag({content:'html{font-size:200%!important}'});
  const menu=page.getByRole('navigation');expect(await menu.evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  const last=page.locator('.academic-session-body summary').last();await last.scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const buttonBox=await last.boundingBox(),menuBox=await menu.boundingBox();expect(buttonBox.y+buttonBox.height).toBeLessThanOrEqual(menuBox.y+1);
  await nav(page,'Início');await page.evaluate(()=>window.MentorApp.navigate('notifications'));await expect(page.locator('.academic-notification-body')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
