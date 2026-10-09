const {test} = require('node:test');
const assert = require('node:assert/strict');
const product = require('../mentorship-product.js');
test('compatibility uses declared subjects and preferences, never invented scores', () => {
  const own={learning_subjects:['Cálculo'],catalog_course_id:'computacao',format:'online',availability_slots:['seg-noite'],study_preference:'individual'};
  const peer={subjects:['Cálculo','Física'],catalog_course_id:'computacao',format:'hibrido',availability_slots:['seg-noite'],study_preference:'ambos'};
  assert.deepEqual(product.reasons(peer,own),['Pode ajudar em Cálculo','Mesmo curso e modalidade','Formatos de encontro compatíveis','Horário em comum: Segunda · noite','Preferências de estudo compatíveis']);
  assert.deepEqual(product.reasons({},{}),[]);
  assert.ok(!product.reasons(peer,own).join().includes('%'));
});
test('availability has 21 distinct explicit weekly periods', () => {
  assert.equal(product.slots.length,21); assert.equal(new Set(product.slots.map(x=>x.value)).size,21);
  assert.ok(product.slots.every(x=>/^(seg|ter|qua|qui|sex|sab|dom)-(manha|tarde|noite)$/.test(x.value)));
});
test('guided request trims strings, validates whitespace and optional date', () => {
  const form=values=>({querySelector:key=>({value:values[key]||''})});
  const data={'#requestQuestion':'  Preciso entender limites.  ','#requestObjective':' Resolver exercícios. '};
  assert.deepEqual(product.guided(form(data)),{p_question:'Preciso entender limites.',p_objective:'Resolver exercícios.',p_proposed_at:null});
  assert.throws(()=>product.guided(form({...data,'#requestQuestion':'           '})),/Explique/);
  assert.throws(()=>product.guided(form({...data,'#requestTime':'2020-01-01T18:00'}),Date.UTC(2026,0,1)),/futuro/);
  assert.throws(()=>product.guided(form({...data,'#requestTime':'invalid'})),/futuro/);
  assert.throws(()=>product.guided(form({...data,'#requestTime':'2030-01-01T18:00'}),Date.UTC(2026,0,1)),/futuro/);
});
