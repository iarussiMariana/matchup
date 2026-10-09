const {expect} = require('@playwright/test');
const subjects = ['Cálculo','Física','Álgebra','Programação','Algoritmos','Ética, Ciência e Sociedade',...Array.from({length:13},(_,i)=>`Disciplina ${i}`),...'ABCDEFGHI'].map(name=>({name,semester:1}));
const catalog = {institution:'FACENS',checked_at:'2026-01-01',source_url:'https://facens.br/graduacao/',courses:[
  {id:'engenharia',name:'Engenharia',modality:'Presencial',degree:'Bacharelado',source_url:'https://facens.br/graduacao/engenharia/',curriculum_source_url:null,curriculum_version:'Teste isolado',curriculum_status:'complete',subjects},
  {id:'matematica',name:'Matemática',modality:'Presencial',degree:'Bacharelado',source_url:'https://facens.br/graduacao/matematica/',curriculum_source_url:null,curriculum_version:null,curriculum_status:'partial',subjects:[{name:'Estatística',semester:1}]},
  {id:'sem-matriz',name:'Curso sem matriz publicada',modality:'EAD',degree:'Tecnólogo',source_url:'https://facens.br/graduacao/',curriculum_source_url:null,curriculum_version:null,curriculum_status:'unavailable',subjects:[]}
]};
async function chooseSubjects(page,label,values) {
  const group=page.getByRole('group',{name:label,exact:true});
  while(await group.locator('.catalog-chip').count()) await group.locator('.catalog-chip').first().click();
  if (!await group.locator('details').getAttribute('open').then(x=>x!==null)) await group.locator('summary').click();
  for(const value of values){await group.getByRole('searchbox').fill(value);await group.getByRole('checkbox',{name:value,exact:true}).check();}
  await group.getByRole('searchbox').fill('');
  await expect(group.locator('.catalog-chip')).toHaveCount(values.length);
}
module.exports={catalog,chooseSubjects};
