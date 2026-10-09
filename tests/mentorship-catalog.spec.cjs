const {test,expect}=require('@playwright/test');
const {setup,profile}=require('./mentorship-fixture.cjs');
const {catalog,chooseSubjects}=require('./catalog-fixture.cjs');
const own=(extra={})=>profile({catalog_course_id:'engenharia',course:'Engenharia',current_subjects:[],subjects:['Cálculo'],learning_subjects:[],...extra});
async function editProfile(page,options={}){const result=await setup(page,{own:own(),...options});await page.getByRole('navigation').getByRole('button',{name:'Perfil',exact:true}).click();await expect(page.getByLabel('Curso',{exact:true})).toBeVisible();return result;}
let errors;
test.beforeEach(({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));

test('official selectors search without accents and preserve a comma-containing title as one discipline',async({page})=>{
  const {db}=await editProfile(page);await expect(page.getByLabel('Curso',{exact:true})).toHaveValue('engenharia');
  const group=page.getByRole('group',{name:'Quero aprender',exact:true});await group.locator('summary').click();await group.getByRole('searchbox').fill('sem resultado xyz');
  await expect(group.getByText('Nenhuma disciplina encontrada.')).toBeVisible();
  await group.getByRole('searchbox').fill('etica ciencia');await group.getByRole('checkbox',{name:'Ética, Ciência e Sociedade',exact:true}).check();
  await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.MentorApp.profile.learning_subjects)).toEqual(['Ética, Ciência e Sociedade']);
  const saved=db.calls.find(c=>c.name==='mentor_save_product').body;expect(saved.p_course_id).toBe('engenharia');expect(saved.p_profile.course).toBe('Engenharia');
});

test('current disciplines follow course while teaching and learning remain cross-course',async({page})=>{
  await editProfile(page);await chooseSubjects(page,'Matérias que estou cursando',['Física']);await chooseSubjects(page,'Posso ajudar com',['Estatística']);
  await page.getByLabel('Curso',{exact:true}).selectOption('matematica');
  const current=page.getByRole('group',{name:'Matérias que estou cursando',exact:true});await expect(current.locator('.catalog-chip')).toHaveCount(0);await expect(current.getByRole('checkbox',{name:'Estatística',exact:true})).toBeVisible();await expect(current.getByRole('checkbox',{name:'Física',exact:true})).toHaveCount(0);
  await expect(page.getByRole('group',{name:'Posso ajudar com',exact:true}).locator('.catalog-chip')).toHaveText('Estatística×');
  await expect(page.locator('#catalogCourseInfo')).toContainText('parcial');
  await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.MentorApp.profile.course)).toBe('Matemática');
});

test('saved legacy values survive course changes and may be removed but not typed in',async({page})=>{
  await editProfile(page,{own:profile({course:'Curso antigo',catalog_course_id:null,current_subjects:['Disciplina antiga'],subjects:['Mentoria antiga']})});
  const current=page.getByRole('group',{name:'Matérias que estou cursando',exact:true});await expect(current.locator('.catalog-chip')).toContainText('Disciplina antiga');
  await page.getByLabel('Curso',{exact:true}).selectOption('matematica');await expect(current.locator('.catalog-chip')).toContainText('Disciplina antiga');
  await current.getByRole('button',{name:'Remover Disciplina antiga',exact:true}).click();await current.locator('summary').click();await current.getByRole('searchbox').fill('Disciplina inventada');await expect(current.getByText('Nenhuma disciplina encontrada.')).toBeVisible();
  await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.MentorApp.profile.current_subjects)).toEqual([]);await expect.poll(()=>page.evaluate(()=>window.MentorApp.profile.subjects)).toEqual(['Mentoria antiga']);
});

test('courses without a published matrix say so and offer no invented current disciplines',async({page})=>{
  await editProfile(page);await page.getByLabel('Curso',{exact:true}).selectOption('sem-matriz');
  await expect(page.locator('#catalogCourseInfo')).toContainText('não disponibilizou');const current=page.getByRole('group',{name:'Matérias que estou cursando',exact:true});await current.locator('summary').click();await expect(current.getByRole('checkbox')).toHaveCount(0);await expect(current.getByText('Nenhuma disciplina publicada nesta grade.')).toBeVisible();
  await chooseSubjects(page,'Quero aprender',['Álgebra']);
});

test('catalog network errors have a real retry rather than a free text fallback',async({page})=>{
  const {db}=await setup(page,{own:own(),errors:{mentor_catalog:{message:'Falha de conexão do catálogo'}}});await page.getByRole('navigation').getByRole('button',{name:'Perfil',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Uma pausa na conexão.'})).toBeVisible();await expect(page.getByLabel('Curso',{exact:true})).toHaveCount(0);delete db.errors.mentor_catalog;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByLabel('Curso',{exact:true})).toBeVisible();
});

test('late catalog reads cannot replace the active screen',async({page})=>{
  await setup(page,{own:own(),delays:{mentor_catalog:400}});await page.getByRole('navigation').getByRole('button',{name:'Perfil',exact:true}).click();await expect(page.getByText('Carregando cursos e disciplinas da FACENS…')).toBeVisible();await page.getByRole('navigation').getByRole('button',{name:'Início',exact:true}).click();await page.waitForTimeout(500);await expect(page.getByRole('heading',{name:'Bem-vindo de volta'})).toBeVisible();await expect(page.getByLabel('Curso',{exact:true})).toHaveCount(0);
});

test('subject results paginate and keyboard users can select the last title',async({page})=>{
  const many=structuredClone(catalog);many.courses[0].subjects=Array.from({length:70},(_,i)=>({name:`Tema ${String(i).padStart(2,'0')}`,semester:1}));
  await editProfile(page,{db:{catalog:many}});const current=page.getByRole('group',{name:'Matérias que estou cursando',exact:true});await current.locator('summary').focus();await page.keyboard.press('Enter');await expect(current.getByRole('checkbox')).toHaveCount(30);await current.getByRole('button',{name:'Mostrar mais resultados'}).click();await expect(current.getByRole('checkbox')).toHaveCount(60);await current.getByRole('button',{name:'Mostrar mais resultados'}).click();await expect(current.getByRole('checkbox')).toHaveCount(70);const last=current.getByRole('checkbox',{name:'Tema 69',exact:true});await last.focus();await page.keyboard.press('Space');await expect(current.locator('.catalog-chip')).toContainText('Tema 69');
});

test('new groups require a selected catalog discipline and preserve its full title',async({page})=>{
  const {db}=await setup(page,{own:own(),db:{addonResponses:{mentor_groups:[],mentor_group_create:{id:'new-group'},mentor_group_detail:{id:'new-group',name:'Grupo',subject:'Ética, Ciência e Sociedade',members:[],messages:[],is_member:true,is_owner:true}}}});
  await page.getByRole('navigation').getByRole('button',{name:'Chat',exact:true}).click();await page.getByRole('button',{name:'Grupos de estudo',exact:true}).click();await page.getByRole('button',{name:'Criar grupo',exact:true}).click();
  await page.getByLabel('Nome do grupo').fill('Grupo de ética');await page.getByLabel('Assunto',{exact:true}).fill('Debate');await page.getByLabel('Objetivo').fill('Estudar em conjunto');await page.locator('.academic-group-form').getByRole('button',{name:'Criar grupo',exact:true}).click();await expect(page.getByText('Selecione uma disciplina do catálogo.')).toBeVisible();
  await expect(page.locator('#groupSubject details')).toHaveAttribute('open','');await page.getByRole('searchbox',{name:'Buscar em disciplinas da FACENS',exact:false}).fill('etica');await page.getByRole('radio',{name:'Ética, Ciência e Sociedade',exact:true}).check();await page.locator('.academic-group-form').getByRole('button',{name:'Criar grupo',exact:true}).click();
  await expect.poll(()=>db.calls.find(c=>c.name==='mentor_group_create')?.body.p_group.subject).toBe('Ética, Ciência e Sociedade');
});

for(const size of [{width:320,height:568},{width:568,height:320}])test(`expanded catalog remains usable at ${size.width}px and 200 percent text`,async({page})=>{
  await page.setViewportSize(size);const long=structuredClone(catalog);long.courses[0].subjects.push({name:'Fundamentos interdisciplinares de desenvolvimento e inovação tecnológica',semester:1});await editProfile(page,{db:{catalog:long}});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  const group=page.getByRole('group',{name:'Matérias que estou cursando',exact:true});await group.locator('summary').click();await group.getByRole('searchbox').fill('Fundamentos');await group.getByRole('checkbox').check();await expect(group.locator('.catalog-chip')).toContainText('Fundamentos');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.getByRole('button',{name:'Salvar perfil',exact:true}).scrollIntoViewIfNeeded();const save=await page.getByRole('button',{name:'Salvar perfil',exact:true}).boundingBox();const nav=await page.getByRole('navigation').boundingBox();expect(save.y+save.height).toBeLessThanOrEqual(nav.y+1);
});

const official=require('../data/facens-catalog.json');
test('all official course modalities load and the longest published title saves without truncation',async({page})=>{
  const record=official.courses.flatMap(course=>course.subjects.map(subject=>({course,subject}))).sort((a,b)=>b.subject.name.length-a.subject.name.length)[0];
  const {db}=await editProfile(page,{own:own({course:record.course.name,catalog_course_id:record.course.id}),db:{catalog:official}});
  for(const course of official.courses){await page.getByLabel('Curso',{exact:true}).selectOption(course.id);await expect(page.locator('#catalogCourseInfo strong')).toHaveText(course.name);}
  await page.getByLabel('Curso',{exact:true}).selectOption(record.course.id);
  await chooseSubjects(page,'Matérias que estou cursando',[record.subject.name]);await chooseSubjects(page,'Posso ajudar com',[record.subject.name]);
  await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();await expect.poll(()=>db.own.subjects).toEqual([record.subject.name]);expect(record.subject.name.length).toBe(113);expect(db.own.current_subjects).toEqual([record.subject.name]);
  await page.getByRole('navigation').getByRole('button',{name:'Descobrir',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar disciplina'}).fill(record.subject.name);await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect.poll(()=>db.calls.filter(c=>c.name==='mentor_discover_product').at(-1).body.p_subject).toBe(record.subject.name);
});

test('a repeated published discipline offers one choice with both semester references',async({page})=>{
  const course=official.courses.find(c=>c.id==='medicina-presencial');const repeated=course.subjects.find((s,i,all)=>all.some((other,j)=>j!==i&&other.name===s.name));expect(repeated).toBeTruthy();
  await editProfile(page,{own:own({course:course.name,catalog_course_id:course.id}),db:{catalog:official}});const current=page.getByRole('group',{name:'Matérias que estou cursando',exact:true});await current.locator('summary').click();await current.getByRole('searchbox').fill(repeated.name);await expect(current.getByRole('checkbox',{name:repeated.name,exact:true})).toHaveCount(1);await expect(current.locator('.catalog-option small')).toHaveText('5º, 6º semestres');
});
