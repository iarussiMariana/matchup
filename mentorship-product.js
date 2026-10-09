(function (root) {
  'use strict';
  const days = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo']];
  const periods = [['manha', 'manhã'], ['tarde', 'tarde'], ['noite', 'noite']];
  const slots = days.flatMap(([day, name]) => periods.map(([period, label]) => ({ value: `${day}-${period}`, label: `${name} · ${label}` })));
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  function reasons(peer, own) {
    const learning = new Set((own.learning_subjects || []).map(normalize));
    const matches = (peer.subjects || []).filter(subject => learning.has(normalize(subject)));
    const result = matches.map(subject => `Pode ajudar em ${subject}`);
    if (peer.catalog_course_id && peer.catalog_course_id === own.catalog_course_id) result.push('Mesmo curso e modalidade');
    else if (peer.course && normalize(peer.course) === normalize(own.course)) result.push('Mesmo curso informado');
    if (peer.format && own.format && (peer.format === own.format || peer.format === 'hibrido' || own.format === 'hibrido')) result.push('Formatos de encontro compatíveis');
    const common = slots.filter(slot => peer.availability_slots?.includes(slot.value) && own.availability_slots?.includes(slot.value));
    if (common.length) result.push(`Horário em comum: ${common.map(slot => slot.label).join(', ')}`);
    if (peer.study_preference && own.study_preference && (peer.study_preference === own.study_preference || peer.study_preference === 'ambos' || own.study_preference === 'ambos')) result.push('Preferências de estudo compatíveis');
    return result;
  }
  const api = () => root.MentorApp;
  const helpers = () => api().helpers;
  const esc = value => helpers().esc(value);
  function reasonMarkup(peer, own) {
    const items = reasons(peer, own);
    return `<section class="product-reasons" aria-label="Por que este perfil?"><h3>Por que este perfil?</h3>${items.length ? `<ul>${items.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>` : '<p>Explore as disciplinas deste estudante. Ainda não há preferências em comum informadas.</p>'}<small>Comparação das informações declaradas, não uma avaliação de qualidade. Confirme os horários na conversa.</small></section>`;
  }
  function profileMarkup(draft) {
    return `<details class="product-section"><summary>Como você ajuda e quando pode estudar (opcional)</summary><div class="field"><label for="methodology">Como gosto de explicar</label><textarea id="methodology" name="methodology" maxlength="1000" placeholder="Ex.: exemplos práticos, exercícios juntos e revisão das dúvidas.">${esc(draft.methodology)}</textarea></div><div class="field"><label for="experience">Minha experiência com a matéria</label><textarea id="experience" name="experience" maxlength="1000" placeholder="Ex.: já cursei a disciplina e ajudei meu grupo de estudos.">${esc(draft.experience)}</textarea><small>Experiência declarada por você, sem certificação automática.</small></div><fieldset class="product-slots"><legend>Horários habituais</legend><p>Marque os períodos possíveis. Não são reservas; combine o horário exato depois.</p>${slots.map(slot => `<label class="check"><input type="checkbox" name="availability_slots" value="${slot.value}" ${draft.availability_slots?.includes(slot.value) ? 'checked' : ''}><span>${slot.label}</span></label>`).join('')}</fieldset></details>`;
  }
  function fields(form) {
    const data = new FormData(form);
    return { methodology: String(data.get('methodology') || '').trim(), experience: String(data.get('experience') || '').trim(), availability_slots: data.getAll('availability_slots').filter(value => slots.some(slot => slot.value === value)) };
  }
  function detailMarkup(peer) {
    return `<section class="product-details"><div class="detail-item"><h3>Como gosto de explicar</h3><p>${esc(peer.methodology || 'Ainda não informado. Combine a melhor forma de estudar na conversa.')}</p></div><div class="detail-item"><h3>Experiência declarada</h3><p>${esc(peer.experience || 'Ainda não informada.')}</p></div><div class="detail-item"><h3>Horários habituais</h3><p>${esc(slots.filter(slot => peer.availability_slots?.includes(slot.value)).map(slot => slot.label).join(' · ') || 'A combinar')}</p></div></section>`;
  }
  function filtersMarkup(filters, catalog) {
    const select = (name, label, options) => `<div class="field"><label for="filter-${name}">${label}</label><select id="filter-${name}" name="${name}"><option value="">Todos</option>${options.map(([value, text]) => `<option value="${esc(value)}" ${String(filters[name] || '') === String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></div>`;
    return `<details class="product-section" ${Object.values(filters).some(Boolean) ? 'open' : ''}><summary>Refinar descoberta</summary><div class="product-filters">${select('course', 'Curso do estudante', catalog.courses.map(course => [course.id, `${course.name} · ${course.modality}`]))}${select('semester', 'Semestre do estudante', Array.from({ length: 20 }, (_, i) => [i + 1, `${i + 1}º semestre`]))}${select('format', 'Formato do encontro', [['online', 'Online'], ['presencial', 'Presencial'], ['hibrido', 'Híbrido']])}${select('slot', 'Horário habitual', slots.map(slot => [slot.value, slot.label]))}</div><p class="muted">Horários são indicações de disponibilidade, não agendamentos confirmados.</p><div class="product-actions"><button class="btn soft" type="submit">Aplicar filtros</button><button class="text-btn" type="button" data-action="clear-search">Limpar busca e filtros</button></div></details>`;
  }
  function favoriteButton(peer) {
    return `<button type="button" class="btn secondary product-favorite" data-favorite="${esc(peer.id)}" aria-pressed="${Boolean(peer.is_favorite)}" aria-label="${peer.is_favorite ? 'Remover dos' : 'Salvar nos'} favoritos: ${esc(peer.name)}">${helpers().icon('star')}<span>${peer.is_favorite ? 'Salvo' : 'Salvar perfil'}</span></button>`;
  }
  async function toggleFavorite(button) {
    if (button.disabled) return;
    const { rpc, toast, friendly } = helpers(), epoch = api().epoch, id = button.dataset.favorite, saved = button.getAttribute('aria-pressed') !== 'true';
    button.disabled = true;
    try {
      const confirmed = await rpc('mentor_favorite', { p_user: id, p_saved: saved }, { mutation: true });
      if (!api().isCurrent(epoch) || !button.isConnected) return;
      if (confirmed !== saved) throw Object.assign(new Error(), { publicMessage: 'Não foi possível confirmar a alteração. Atualize a lista e tente novamente.' });
      api().updateFavorite(id, saved);
      for (const target of document.querySelectorAll('[data-favorite]')) if (target.dataset.favorite === id) {
        target.setAttribute('aria-pressed', String(saved));
        target.setAttribute('aria-label', target.getAttribute('aria-label').replace(/^(Salvar nos|Remover dos)/, saved ? 'Remover dos' : 'Salvar nos'));
        target.querySelector('span').textContent = saved ? 'Salvo' : 'Salvar perfil';
      }
      toast(saved ? 'Perfil salvo nos seus favoritos.' : 'Perfil removido dos favoritos.');
      if (!saved && api().view === 'favorites') api().navigate('favorites', false);
    } catch (error) { if (api().isCurrent(epoch)) toast(friendly(error)); }
    finally { button.disabled = false; }
  }
  async function renderFavorites(container) {
    const epoch = api().epoch, { rpc, loading, empty, friendly } = helpers();
    container.innerHTML = `<div class="intro"><p class="eyebrow">Seu próximo encontro</p><h1>Perfis salvos</h1><p>Só você vê esta lista. Perfis indisponíveis ou bloqueados deixam de aparecer.</p></div><div id="favoriteList">${loading()}</div>`;
    try {
      const profiles = await rpc('mentor_favorites');
      if (!api().isCurrent(epoch)) return;
      document.getElementById('favoriteList').innerHTML = profiles.length ? `<div class="list">${profiles.map(peer => `<article class="list-card"><h2>${esc(peer.name)}</h2><p>${esc(peer.course)} · ${esc(peer.semester)}º semestre</p>${reasonMarkup(peer, api().profile)}<div class="product-actions"><button class="btn primary" data-peer="${esc(peer.id)}">Ver perfil</button>${favoriteButton({ ...peer, is_favorite: true })}</div></article>`).join('')}</div>` : empty('Um bom perfil merece ser lembrado.', 'Salve estudantes na descoberta para encontrá-los depois.', 'explore', 'Descobrir estudantes');
    } catch (error) { if (api().isCurrent(epoch)) document.getElementById('favoriteList').innerHTML = `<div class="notice error" role="alert">${esc(friendly(error))}</div><button class="btn secondary" data-nav="favorites">Tentar novamente</button>`; }
  }
  const requestFields = () => '<div class="field"><label for="requestQuestion">Qual é sua dúvida?</label><textarea id="requestQuestion" minlength="10" maxlength="1000" required placeholder="Conte em que parte você travou e o que já tentou."></textarea><small>De 10 a 1.000 caracteres. Não compartilhe informações sensíveis.</small></div><div class="field"><label for="requestObjective">O que você quer conseguir?</label><textarea id="requestObjective" minlength="5" maxlength="500" required placeholder="Ex.: resolver exercícios de limites com autonomia."></textarea></div><div class="field"><label for="requestTime">Quando gostaria de estudar? (opcional)</label><input id="requestTime" type="datetime-local"><small>Horário local do seu dispositivo. É uma sugestão, não um encontro confirmado.</small></div>';
  function guided(form, now = Date.now()) {
    const question = form.querySelector('#requestQuestion').value.trim(), objective = form.querySelector('#requestObjective').value.trim(), raw = form.querySelector('#requestTime').value;
    const fail = text => { throw Object.assign(new Error(text), { publicMessage: text }); };
    if ([...question].length < 10 || [...question].length > 1000 || [...objective].length < 5 || [...objective].length > 500) fail('Explique sua dúvida (10 a 1.000 caracteres) e seu objetivo (5 a 500 caracteres).');
    const date = raw ? new Date(raw) : null;
    if (date && (!Number.isFinite(+date) || +date <= now || +date > now + 365 * 86400000)) fail('Sugira um horário futuro, dentro dos próximos 365 dias.');
    return { p_question: question, p_objective: objective, p_proposed_at: date ? date.toISOString() : null };
  }
  function requestSummary(request) {
    if (!request.question && !request.objective && !request.proposed_at) return '';
    const date = new Date(request.proposed_at);
    return `<details class="product-section"><summary>Contexto do pedido</summary>${request.question ? `<h4>Dúvida</h4><p>${esc(request.question)}</p>` : ''}${request.objective ? `<h4>Objetivo</h4><p>${esc(request.objective)}</p>` : ''}${request.proposed_at && Number.isFinite(+date) ? `<p>Horário sugerido: <time datetime="${date.toISOString()}">${esc(date.toLocaleString('pt-BR'))}</time> (horário local). Ainda não agendado.</p>` : ''}</details>`;
  }
  const reportReasons = { harassment: 'Assédio ou desrespeito', spam: 'Spam ou propaganda', impersonation: 'Falsa identidade', inappropriate: 'Conteúdo inadequado', other: 'Outro motivo' };
  const reportStatus = { pending: 'Em análise', reviewed: 'Analisada', dismissed: 'Arquivada' };
  function reportDialog(peer) {
    const { dialog, rpc, toast, notice, friendly } = helpers(), epoch = api().epoch;
    const node = dialog('Denunciar estudante', `<p>Relate o problema com <strong>${esc(peer.name)}</strong>. Sua identidade não é mostrada à pessoa denunciada. A equipe autorizada poderá consultar o relato. Para interromper o contato imediatamente, use também o bloqueio.</p><div id="reportNotice"></div><form id="reportForm" class="stack"><div class="field"><label for="reportReason">Motivo da denúncia</label><select id="reportReason" required><option value="">Selecione</option>${Object.entries(reportReasons).map(([key, value]) => `<option value="${key}">${value}</option>`).join('')}</select></div><div class="field"><label for="reportDetails">O que aconteceu?</label><textarea id="reportDetails" minlength="10" maxlength="2000" required></textarea><small>De 10 a 2.000 caracteres. Informe o contexto necessário, sem senhas ou documentos.</small></div><button class="btn primary" type="submit">Enviar denúncia</button></form>`);
    node.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const button = event.currentTarget.querySelector('button'); if (button.disabled) return;
      button.disabled = true;
      try {
        const details = node.querySelector('#reportDetails').value.trim();
        if ([...details].length < 10) throw Object.assign(new Error(), { publicMessage: 'Descreva o ocorrido em pelo menos 10 caracteres.' });
        await rpc('mentor_report', { p_user: peer.id, p_reason: node.querySelector('#reportReason').value, p_details: details }, { mutation: true });
        if (!api().isCurrent(epoch) || !node.isConnected) return;
        helpers().closeDialog(); toast('Denúncia registrada. Acompanhe em Perfil → Segurança e denúncias.');
      } catch (error) { if (api().isCurrent(epoch) && node.isConnected) notice(node.querySelector('#reportNotice'), friendly(error)); }
      finally { button.disabled = false; }
    };
  }
  async function safetyDialog() {
    const { dialog, rpc, loading, friendly } = helpers(), epoch = api().epoch;
    const node = dialog('Segurança e denúncias', `<p>Bloquear interrompe o contato; denunciar solicita uma análise. Denúncias não são um canal de emergência. A análise depende da equipe responsável pelo projeto.</p><div id="safetyContent">${loading()}</div>`), target = node.querySelector('#safetyContent');
    try {
      const [reports, moderator] = await Promise.all([rpc('mentor_my_reports'), rpc('mentor_moderation_access')]);
      if (!api().isCurrent(epoch) || !node.isConnected) return;
      target.innerHTML = `<h3>Minhas denúncias</h3>${reports.length ? reports.map(report => `<article class="list-card"><h4>${esc(reportReasons[report.reason] || 'Denúncia')}</h4><p>${esc(reportStatus[report.status] || 'Em análise')}</p><small>${esc(new Date(report.created_at).toLocaleDateString('pt-BR'))}</small>${report.resolution_note ? `<p>${esc(report.resolution_note)}</p>` : ''}</article>`).join('') : '<p>Você ainda não registrou denúncias.</p>'}${moderator === true ? '<button class="btn secondary full" id="moderationQueue">Abrir painel de moderação</button>' : ''}`;
      target.querySelector('#moderationQueue')?.addEventListener('click', () => moderationDialog());
    } catch (error) { if (api().isCurrent(epoch) && node.isConnected) { target.innerHTML = `<div class="notice error" role="alert">${esc(friendly(error))}</div><button class="btn secondary" id="safetyRetry">Tentar novamente</button>`; target.querySelector('button').onclick = safetyDialog; } }
  }
  async function moderationDialog(status = 'pending') {
    const { dialog, rpc, loading, friendly, toast } = helpers(), epoch = api().epoch;
    const node = dialog('Painel de moderação', `<div class="field"><label for="moderationStatus">Situação das denúncias</label><select id="moderationStatus">${Object.entries(reportStatus).map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p>Revise o contexto antes de decidir. Restringir impede o uso dos recursos acadêmicos até uma restauração autorizada. As ações ficam registradas para auditoria.</p><div id="moderationContent">${loading()}</div>`), target = node.querySelector('#moderationContent');
    node.querySelector('select').onchange = event => moderationDialog(event.target.value);
    try {
      const reports = await rpc('mentor_moderation_queue', { p_status: status });
      if (!api().isCurrent(epoch) || !node.isConnected) return;
      target.innerHTML = reports.length ? reports.map((report, index) => `<article class="list-card"><h3>${esc(report.target_name || report.target?.name || 'Estudante denunciado')}</h3><small>Relatado por ${esc(report.reporter_name || report.reporter?.name || 'Estudante')}</small><p>${esc(reportReasons[report.reason] || report.reason)}</p><p>${esc(report.details)}</p><form class="stack" data-report-id="${esc(report.id)}"><div class="field"><label for="decision-${index}">Decisão</label><select id="decision-${index}" name="status"><option value="reviewed">Analisada</option><option value="dismissed">Arquivada</option></select></div><div class="field"><label for="action-${index}">Ação sobre o acesso</label><select id="action-${index}" name="action"><option value="none">Manter acesso</option><option value="restrict">Restringir acesso acadêmico</option><option value="restore">Restaurar acesso acadêmico</option></select></div><div class="field"><label for="note-${index}">Justificativa da análise</label><textarea id="note-${index}" name="note" minlength="10" maxlength="1000" required></textarea><small>Explique a decisão sem dados sensíveis. A justificativa poderá ser informada a quem denunciou.</small></div><label class="check"><input type="checkbox" required><span>Revisei o relato e confirmo esta decisão.</span></label><div class="product-moderation-notice"></div><button class="btn primary">Registrar decisão</button></form></article>`).join('') : '<p>Nenhuma denúncia nesta situação.</p>';
      for (const form of target.querySelectorAll('form')) form.onsubmit = async event => {
        event.preventDefault(); const button = form.querySelector('button'); if (button.disabled) return;
        const data = new FormData(form); button.disabled = true;
        try {
          await rpc('mentor_moderate', { p_report: form.dataset.reportId, p_status: data.get('status'), p_action: data.get('action'), p_note: String(data.get('note')).trim() }, { mutation: true });
          if (api().isCurrent(epoch) && node.isConnected) { toast('Decisão registrada.'); moderationDialog(status); }
        } catch (error) { if (api().isCurrent(epoch) && node.isConnected) helpers().notice(form.querySelector('.product-moderation-notice'), friendly(error)); }
        finally { button.disabled = false; }
      };
    } catch (error) { if (api().isCurrent(epoch) && node.isConnected) { target.innerHTML = `<div class="notice error" role="alert">${esc(friendly(error))}</div><button class="btn secondary" id="moderationRetry">Tentar novamente</button>`; target.querySelector('button').onclick = () => moderationDialog(status); } }
  }
  async function optimizePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Image unavailable');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
      if (!blob?.size) throw new Error('Image unavailable');
      return blob;
    } catch { throw Object.assign(new Error('Invalid image'), { publicMessage: 'Não foi possível preparar esta foto. Escolha outra imagem JPG, PNG ou WebP.' }); }
    finally { URL.revokeObjectURL(url); }
  }
  const exports = { slots, normalize, reasons, reasonMarkup, profileMarkup, fields, detailMarkup, filtersMarkup, favoriteButton, renderFavorites, requestFields, guided, requestSummary, reportDialog, safetyDialog, optimizePhoto };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else { root.MentorProduct = exports; document.addEventListener('click', event => { const button = event.target.closest('[data-favorite]'); if (button) toggleFavorite(button); }); }
})(typeof window !== 'undefined' ? window : globalThis);
