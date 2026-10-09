'use strict';
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const forms = new WeakMap();
  const fields = [['current_subjects', 'Matérias que estou cursando', 12], ['subjects', 'Posso ajudar com', 8], ['learning_subjects', 'Quero aprender', 8]];
  function allSubjects(catalog) {
    return [...new Map(catalog.courses.flatMap(c => c.subjects).map(s => [s.name.toLocaleLowerCase('pt-BR'), {name:s.name}])).values()].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  function courseSubjects(course) {
    const unique = new Map();
    for (const subject of course?.subjects || []) {
      const id = subject.name.toLocaleLowerCase('pt-BR');
      if (!unique.has(id)) unique.set(id, {name:subject.name, semesters:[]});
      if (subject.semester && !unique.get(id).semesters.includes(subject.semester)) unique.get(id).semesters.push(subject.semester);
    }
    return [...unique.values()];
  }
  function validate(catalog) {
    if (!catalog || !Array.isArray(catalog.courses) || !catalog.courses.length || catalog.courses.some(c => !c.id || !c.name || !Array.isArray(c.subjects))) throw new Error('Catálogo indisponível');
    return catalog;
  }
  function markup() {
    return fields.map(([name, label]) => `<fieldset class="catalog-field" data-catalog-field="${name}"><legend>${label}</legend></fieldset>`).join('');
  }
  function picker(root, {name, label, limit, selected = [], options = [], onChange = () => {}, single = false}) {
    let values = [...selected], items = options, shown = 30;
    root.innerHTML = (root.querySelector(':scope > legend')?.outerHTML || '') + `<div class="catalog-chips" aria-label="Disciplinas selecionadas"></div><p class="catalog-count" role="status" aria-live="polite"></p><details class="catalog-browser"><summary>Selecionar ${single ? 'disciplina' : 'disciplinas'}</summary><label for="catalog-${name}">Buscar em ${esc(label.toLocaleLowerCase('pt-BR'))}</label><input id="catalog-${name}" type="search" autocomplete="off" placeholder="Digite para buscar, depois selecione"><div class="catalog-options"></div><button class="text-btn" type="button" data-more>Mostrar mais resultados</button><p class="catalog-empty"></p></details><small class="catalog-legacy"></small>`;
    const chips = root.querySelector('.catalog-chips'), count = root.querySelector('.catalog-count'), search = root.querySelector('input'), list = root.querySelector('.catalog-options'), more = root.querySelector('[data-more]');
    const render = () => {
      chips.innerHTML = values.map((value, index) => `<button type="button" class="catalog-chip" data-remove="${index}" aria-label="Remover ${esc(value)}"><span>${esc(value)}</span><span aria-hidden="true">×</span></button>`).join('');
      count.textContent = `${values.length} de ${limit} ${single ? 'selecionada' : 'selecionadas'}${values.length >= limit && !single ? ' · Limite atingido. Remova uma para trocar.' : ''}`;
      const terms = key(search.value.trim()).split(/\s+/).filter(Boolean);
      const filtered = items.filter(item => terms.every(term => key(item.name).includes(term)));
      list.innerHTML = filtered.slice(0, shown).map((item, index) => `<label class="catalog-option"><input type="${single ? 'radio' : 'checkbox'}" ${single ? `name="catalog-radio-${esc(name)}"` : ''} aria-label="${esc(item.name)}" data-option="${index}" ${values.includes(item.name) ? 'checked' : ''} ${!single && values.length >= limit && !values.includes(item.name) ? 'disabled' : ''}><span>${esc(item.name)}${item.semesters?.length ? `<small>${item.semesters.join('º, ')}º semestre${item.semesters.length > 1 ? 's' : ''}</small>` : ''}</span></label>`).join('');
      more.hidden = filtered.length <= shown;
      root.querySelector('.catalog-empty').textContent = !filtered.length ? (items.length ? 'Nenhuma disciplina encontrada. Tente outro termo.' : 'Nenhuma disciplina publicada nesta grade. Você pode selecionar matérias de outros cursos nos campos de ajuda e aprendizado.') : `${Math.min(shown, filtered.length)} de ${filtered.length} resultados`;
      root.querySelector('.catalog-legacy').textContent = values.some(value => !items.some(item => item.name === value)) ? 'Seleções anteriores fora desta grade foram preservadas. Você pode removê-las; não serão convertidas automaticamente.' : '';
      list.onchange = event => {
        const item = filtered[Number(event.target.dataset.option)]; if (!item) return;
        if (single) values = [item.name];
        else if (event.target.checked && values.length < limit) values.push(item.name);
        else if (!event.target.checked) values = values.filter(value => value !== item.name);
        const index = event.target.dataset.option;
        render(); list.querySelector(`[data-option="${index}"]`)?.focus({preventScroll:true}); onChange([...values]);
      };
    };
    chips.onclick = event => { const b = event.target.closest('[data-remove]'); if (!b) return; const index = Number(b.dataset.remove); values.splice(index, 1); render(); (chips.querySelectorAll('button')[Math.max(0,index-1)] || root.querySelector('summary')).focus({preventScroll:true}); onChange([...values]); };
    search.oninput = () => { shown = 30; render(); };
    more.onclick = () => { const firstNew = shown; shown += 30; render(); list.querySelector(`[data-option="${firstNew}"]`)?.focus(); };
    render();
    return {values: () => [...values], update(next, nextValues = values) {items = next; values = [...nextValues]; shown = 30; render();}};
  }
  function mount(form, catalog, draft, persisted) {
    const course = form.querySelector('#course'), info = form.querySelector('#catalogCourseInfo'), controls = new Map(), all = allSubjects(catalog);
    const legacy = !draft.catalog_course_id && persisted?.course ? persisted.course : null;
    course.innerHTML = `<option value="">Selecione seu curso</option>${legacy ? `<option value="__legacy">${esc(legacy)} · cadastro anterior</option>` : ''}` + catalog.courses.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.modality)}</option>`).join('');
    course.value = draft.catalog_course_id || (legacy ? '__legacy' : '');
    const emit = () => form.dispatchEvent(new Event('input', {bubbles:true}));
    for (const [name, label, limit] of fields) controls.set(name, picker(form.querySelector(`[data-catalog-field="${name}"]`), {name,label,limit,selected:draft[name] || [],options:name === 'current_subjects' ? [] : all,onChange:emit}));
    const refresh = (changed = false) => {
      const c = catalog.courses.find(c => c.id === course.value), current = controls.get('current_subjects');
      const selected = current.values().filter(value => !changed || c?.subjects.some(s => s.name === value) || persisted?.current_subjects?.includes(value));
      const adjusted = selected.length !== current.values().length;
      current.update(courseSubjects(c), selected);
      const source = c?.curriculum_source_url || c?.source_url;
      let safeSource = ''; try { const u = new URL(source); if (u.protocol === 'https:' && (u.hostname === 'facens.br' || u.hostname.endsWith('.facens.br'))) safeSource = u.href; } catch {}
      info.innerHTML = c ? `<strong>${esc(c.name)}</strong><span>${esc(c.degree)} · ${esc(c.modality)}</span><span>${c.curriculum_status === 'complete' ? 'Disciplinas da matriz publicada pela FACENS.' : c.curriculum_status === 'partial' ? 'Grade parcial: apenas disciplinas verificadas estão disponíveis.' : 'A FACENS não disponibilizou uma matriz verificável para este curso. Nenhuma disciplina foi inventada.'} ${esc(c.curriculum_version || '')}</span>${safeSource ? `<a href="${esc(safeSource)}" target="_blank" rel="noopener noreferrer">Consultar fonte oficial ↗</a>` : ''}` : '<span>Escolha uma graduação da FACENS para ver as disciplinas do curso. Cadastros anteriores podem ser mantidos.</span>';
      if (adjusted) info.insertAdjacentHTML('beforeend', '<span role="status">As matérias ainda não salvas foram ajustadas ao novo curso.</span>');
    };
    course.addEventListener('change', () => { refresh(true); emit(); });
    forms.set(form, () => ({course:catalog.courses.find(c => c.id === course.value)?.name || (course.value === '__legacy' ? legacy : ''),catalog_course_id:course.value && course.value !== '__legacy' ? course.value : null,...Object.fromEntries([...controls].map(([name,control]) => [name,control.values()]))}));
    refresh();
  }
  function single(root, catalog, selected = '') {
    const control = picker(root, {name:'group-subject',label:'disciplinas da FACENS',limit:1,selected:selected ? [selected] : [],options:allSubjects(catalog),single:true});
    return () => control.values()[0] || '';
  }
  window.MentorCatalog = {validate, markup, mount, single, values:form => forms.get(form)?.() || {}};
})();
