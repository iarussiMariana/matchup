const {test,expect}=require('@playwright/test');
const {setup,mentor}=require('./mentorship-fixture.cjs');
const nav=async(page,name)=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
test('photo optimization actually resizes large input and produces smaller JPEG bytes',async({page})=>{
 await setup(page);
 const result=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;
  const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(1600,1200);let seed=7;
  for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
  const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const blob=await window.MentorProduct.optimizePhoto(original);const bitmap=await createImageBitmap(blob);const result={type:blob.type,before:original.size,after:blob.size,width:bitmap.width,height:bitmap.height,signature:Array.from(new Uint8Array(await blob.slice(0,3).arrayBuffer()))};bitmap.close();return result;
 });
 expect(result.type).toBe('image/jpeg');expect(result.width).toBe(640);expect(result.height).toBe(480);expect(result.after).toBeLessThan(result.before);expect(result.signature).toEqual([255,216,255]);
});
test('late favorites read cannot replace profile after navigating away',async({page})=>{
 const {db}=await setup(page,{mentors:[mentor({is_favorite:true})],delays:{mentor_favorites:500}});await nav(page,'Perfil');await page.getByRole('button',{name:'Perfis salvos',exact:true}).click();await expect.poll(()=>db.calls.some(c=>c.name==='mentor_favorites')).toBe(true);await nav(page,'Perfil');await page.waitForTimeout(650);await expect(page.getByLabel('Nome no perfil')).toBeVisible();await expect(page.locator('#favoriteList')).toHaveCount(0);
});
test('late report success never closes a newer dialog or leaks success after logout',async({page})=>{
 const {db}=await setup(page,{delays:{mentor_report:600}});await nav(page,'Descobrir');await page.getByRole('button',{name:'Ver perfil',exact:false}).click();await page.getByRole('button',{name:'Denunciar estudante',exact:true}).click();await page.getByLabel('Motivo da denúncia').selectOption('spam');await page.getByLabel('O que aconteceu?').fill('Mensagens repetidas de propaganda.');await page.getByRole('button',{name:'Enviar denúncia'}).click();await expect.poll(()=>db.calls.some(c=>c.name==='mentor_report')).toBe(true);await page.getByRole('button',{name:'Fechar janela'}).click();await nav(page,'Perfil');await page.getByRole('button',{name:'Sair da conta',exact:true}).click();await page.waitForTimeout(700);await expect(page.getByRole('button',{name:'Entrar no MatchUp'})).toBeVisible();await expect(page.getByText('Denúncia registrada.',{exact:false})).toHaveCount(0);
});
test('guided request past date retains context and makes no mutation',async({page})=>{
 const {db}=await setup(page);await nav(page,'Descobrir');await page.getByRole('button',{name:'Solicitar monitoria',exact:true}).click();await page.getByLabel('Em qual disciplina?').selectOption('Cálculo');await page.getByLabel('Qual é sua dúvida?').fill('Como calcular limites de funções?');await page.getByLabel('O que você quer conseguir?').fill('Resolver uma lista de exercícios.');await page.getByLabel('Quando gostaria de estudar? (opcional)').fill('2020-01-01T10:00');await page.getByRole('button',{name:'Confirmar solicitação'}).click();await expect(page.getByRole('alert')).toContainText('horário futuro');await expect(page.getByLabel('Qual é sua dúvida?')).toHaveValue('Como calcular limites de funções?');expect(db.calls.some(c=>c.name==='mentor_request_product')).toBe(false);
});
