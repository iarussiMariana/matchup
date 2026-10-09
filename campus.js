/* Independent study groups and carpool trips; loaded after script.js. */
(() => {
  'use strict';
  const copy = {
    study: { title: 'Estudos', subtitle: 'Encontre sua turma. Compartilhe conhecimento.', mine: 'Meus grupos', create: 'Criar grupo', detail: 'Grupo de estudos', join: 'Entrar no grupo', leave: 'Sair do grupo', cancel: 'Cancelar grupo', chat: 'Conversa do grupo', empty: 'Nenhum grupo por aqui ainda.', search: 'Buscar matéria, grupo ou local' },
    ride: { title: 'Caronas', subtitle: 'Caminhos em comum, campus mais perto.', mine: 'Minhas viagens', create: 'Oferecer carona', detail: 'Detalhes da viagem', join: 'Reservar 1 assento', leave: 'Liberar meu assento', cancel: 'Cancelar viagem', chat: 'Conversa da viagem', empty: 'Nenhuma carona por aqui ainda.', search: 'Buscar origem, destino ou viagem' }
  };
  let root, active = false, mode = null, epoch = 0, view = 'list', viewVersion = 0, timer;
  let posts = [], detail = null, selectedId = null, tab = 'discover', query = '', listVersion = 0, detailVersion = 0;
  let listLoading = false, listError = '', detailError = '', modal = null, account = null;
  let pollingRequest = null;
  let drafts = { study: {}, ride: {} }, chatDrafts = {};
  const locks = new Set();
  const esc = value => escapeHtml(String(value ?? ''));
  const el = selector => root?.querySelector(selector);
  const text = () => copy[mode];
  const member = p => p.is_member === true || p.is_owner === true;
  const ended = p => p.status !== 'open' || Date.parse(p.starts_at) <= Date.now();
  const stamp = () => ({ epoch, mode, viewVersion, user: state.userId });
  const current = s => active && s.epoch === epoch && s.mode === mode && s.viewVersion === viewVersion && s.user === state.userId;
  const visible = () => active && !document.hidden && root?.closest('.screen')?.classList.contains('active');
  const when = value => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const status = p => p.status === 'cancelled' ? 'Cancelado' : ended(p) ? 'Encerrado' : p.member_count >= p.capacity ? 'Lotado' : 'Aberto';
  const seats = p => mode === 'study' ? `${p.member_count}/${p.capacity} participantes · inclui organizador` : `${Math.max(0, p.capacity - p.member_count)} de ${p.capacity} assentos disponíveis · motorista à parte`;
  function validPost(p) {
    if (!p || p.mode !== mode || typeof p.id !== 'string' || !p.id || !['open', 'cancelled'].includes(p.status) || !Number.isFinite(Date.parse(p.starts_at)) || !Number.isInteger(p.capacity) || !Number.isInteger(p.member_count) || p.member_count < 0 || p.capacity < 1 || typeof p.is_owner !== 'boolean' || typeof p.is_member !== 'boolean') throw new Error('Resposta inválida. Tente novamente.');
    return p;
  }
  async function rpc(name, args) {
    if (!sparkClient || !state.userId) throw new Error('Entre na sua conta para continuar.');
    const response = await sparkClient.rpc(name, args);
    if (!response || response.error) throw new Error(response?.error?.message || 'Não foi possível conectar. Tente novamente.');
    return response.data;
  }
  const notice = error => showToast(error?.message || 'Não foi possível concluir. Tente novamente.', 'error');
  const errorBox = (message, action) => `<div class="cm-feedback cm-error" role="alert"><p>${esc(message)}</p><button class="btn btn-outline" type="button" data-action="${action}">Tentar novamente</button></div>`;
  const safety = () => mode === 'ride' ? '<aside class="cm-safety">Combine um ponto de encontro público, sem endereço residencial. Confira motorista e veículo antes de viajar. Não oferecemos GPS, pagamento ou serviço de emergência.</aside>' : '';
  const icon = name => window.sparkIcon(name);
  function focusHeading() {
    const title = document.getElementById('activeModeLabel');
    title?.setAttribute('tabindex', '-1');
    title?.focus({ preventScroll: true });
  }
  function shell(content) {
    root.className = `campus-module cm-${mode}`;
    window.setCampusHeading(view === 'create' ? text().create : view === 'detail' ? text().detail : text().title, view === 'list' ? null : back);
    root.innerHTML = `<div class="cm-content">${content}</div>${view === 'list' ? `<nav class="bottom-nav cm-nav" aria-label="Filtrar publicações"><button class="nav-item" type="button" data-action="discover" aria-pressed="${tab === 'discover'}">${icon('compass')}<span>Descobrir</span></button><button class="nav-item" type="button" data-action="mine" aria-pressed="${tab === 'mine'}">${icon(mode === 'study' ? 'users' : 'car')}<span>${esc(text().mine)}</span></button></nav>` : ''}<div class="cm-modal-host"></div>`;
  }
  function listShell() {
    shell(`<p class="cm-subtitle">${esc(text().subtitle)}</p>${safety()}<div class="cm-toolbar"><button class="btn btn-primary cm-primary" type="button" data-action="create" aria-label="+ ${esc(text().create)}">${icon('plus')}${esc(text().create)}</button><button class="btn btn-outline" type="button" data-action="refresh" aria-label="Atualizar mural">${icon('refresh')}Atualizar</button></div><label class="field cm-search">${esc(text().search)}<input type="search" id="cmSearch" maxlength="120" value="${esc(query)}" placeholder="${mode === 'study' ? 'Ex.: Cálculo, biblioteca' : 'Ex.: Centro, FACENS'}"></label><div id="cmList" aria-live="polite"></div>`);
    renderList();
  }
  function renderList() {
    if (view !== 'list') return;
    el('[data-action="refresh"]').disabled = listLoading;
    el('#cmList').innerHTML = listLoading ? '<p class="cm-feedback" role="status">Carregando o mural…</p>' : listError ? errorBox(listError, 'refresh') : cards();
    ['discover', 'mine'].forEach(value => {
      const button = el(`[data-action="${value}"]`);
      button?.setAttribute('aria-pressed', String(tab === value));
      button?.classList.toggle('active', tab === value);
    });
  }
  function cards() {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    const filtered = posts.filter(p => (tab === 'mine' ? member(p) : !ended(p)) && [p.title, p.description, p.subject, p.origin, p.destination, p.meeting_point, p.owner_name].join(' ').toLocaleLowerCase('pt-BR').includes(needle));
    if (!filtered.length) return `<div class="cm-feedback"><h2>${esc(text().empty)}</h2><p>${query ? 'Tente outra busca.' : tab === 'mine' ? 'Suas participações, inclusive canceladas e encerradas, aparecem aqui.' : 'Crie uma publicação ou atualize o mural.'}</p><button class="btn btn-outline" type="button" data-action="refresh">Atualizar mural</button></div>`;
    return `<div class="cm-cards">${filtered.map(p => `<article class="cm-card ${mode === 'study' ? 'cm-notebook' : 'cm-route-card'}">${mode === 'study' ? `<span class="cm-subject">${esc(p.subject)}</span><h2>${esc(p.title)}</h2>` : `<div class="cm-route"><strong>${esc(p.origin)}</strong><span class="cm-route-direction" aria-label="para">${icon('arrow-right')}</span><strong>${esc(p.destination)}</strong></div><h2>${esc(p.title)}</h2>`}<div class="cm-card-meta"><time datetime="${esc(p.starts_at)}">${esc(when(p.starts_at))}</time><span class="cm-status">${esc(status(p))}</span></div><p>${esc(seats(p))}</p><p class="cm-owner">${p.is_owner ? (mode === 'ride' ? 'Você dirige' : 'Você organiza') : esc(p.owner_name || 'Integrante do campus')}${p.is_member && !p.is_owner ? ' · Você participa' : ''}</p><button class="btn btn-outline" type="button" data-action="detail" data-id="${esc(p.id)}">${mode === 'study' ? 'Abrir grupo' : 'Ver trajeto'} <span class="cm-sr-only">${esc(p.title)}</span>${icon('arrow-right')}</button></article>`).join('')}</div>`;
  }
  async function loadList() {
    if (!active || view !== 'list') return;
    const s = stamp(), request = ++listVersion;
    listLoading = true; listError = ''; renderList();
    try {
      const data = await rpc('campus_list', { p_mode: mode });
      if (!current(s) || request !== listVersion) return;
      if (!Array.isArray(data)) throw new Error('Não foi possível ler o mural. Tente novamente.');
      posts = data.map(validPost);
    } catch (error) {
      if (current(s) && request === listVersion) { listError = error.message; notice(error); }
    } finally {
      if (current(s) && request === listVersion) { listLoading = false; renderList(); }
    }
  }
  function field(name, label, { type = 'text', required = false, max = 120, min, value = '', multiline = false } = {}) {
    const saved = drafts[mode][name] ?? value;
    return `<label class="field">${esc(label)}${multiline ? `<textarea name="${name}" maxlength="${max}" ${required ? 'required' : ''}>${esc(saved)}</textarea>` : `<input name="${name}" type="${type}" value="${esc(saved)}" ${type === 'number' ? `min="${min}" max="${max}" step="1"` : `maxlength="${max}"`} ${required ? 'required' : ''}>`}</label>`;
  }
  function createView() {
    view = 'create'; viewVersion++; detail = null; selectedId = null;
    shell(`<section class="cm-form-panel"><p>${mode === 'study' ? 'Uma matéria, uma turma e um objetivo em comum.' : 'Informe regiões e locais públicos — nunca seu endereço residencial.'}</p><form id="cmCreateForm" novalidate>${field('title', mode === 'study' ? 'Nome do grupo' : 'Título da viagem', { required: true, max: 80 })}${mode === 'study' ? field('subject', 'Matéria ou assunto', { required: true, max: 80 }) : field('origin', 'Origem (região ou local público)', { required: true, max: 100 }) + field('destination', 'Destino (região ou local público)', { required: true, max: 100 })}${field('description', mode === 'study' ? 'Objetivo e combinados (opcional)' : 'Informações da viagem (opcional)', { multiline: true, max: 1000 })}${field('meeting_point', 'Ponto de encontro público (opcional)', { max: 160 })}${field('starts_at', mode === 'study' ? 'Data e hora do encontro' : 'Data e hora da saída', { type: 'datetime-local', required: true })}${field('capacity', mode === 'study' ? 'Total de participantes (incluindo você, de 2 a 30)' : 'Assentos para passageiros (sem motorista, de 1 a 8)', { type: 'number', required: true, min: mode === 'study' ? 2 : 1, max: mode === 'study' ? 30 : 8, value: mode === 'study' ? 6 : 3 })}${safety()}<p id="cmFormError" role="alert" class="cm-inline-error"></p><div class="cm-actions"><button class="btn btn-primary cm-primary" type="submit">${esc(text().create)}</button><button class="btn btn-outline" type="button" data-action="back">Agora não</button></div></form></section>`);
    focusHeading();
  }
  function saveCreateDraft() {
    const form = el('#cmCreateForm');
    if (form) drafts[mode] = Object.fromEntries(new FormData(form));
  }
  function createData() {
    saveCreateDraft();
    const d = drafts[mode];
    const data = Object.fromEntries(['title', 'description', 'subject', 'origin', 'destination', 'meeting_point'].map(k => [k, String(d[k] || '').trim()]));
    for (const [key, min, max, label] of [['title', 3, 80, 'Título'], ['description', 0, 1000, 'Descrição'], ['meeting_point', 0, 160, 'Ponto de encontro'], ...(mode === 'study' ? [['subject', 1, 80, 'Matéria']] : [['origin', 1, 100, 'Origem'], ['destination', 1, 100, 'Destino']])]) {
      if (data[key].length < min || data[key].length > max) throw new Error(`${label}: informe ${min ? `de ${min} a` : 'até'} ${max} caracteres.`);
    }
    const date = new Date(d.starts_at);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error('Escolha uma data e hora no futuro.');
    data.starts_at = date.toISOString(); data.capacity = Number(d.capacity);
    if (!Number.isInteger(data.capacity) || data.capacity < (mode === 'study' ? 2 : 1) || data.capacity > (mode === 'study' ? 30 : 8)) throw new Error(mode === 'study' ? 'Informe de 2 a 30 participantes, incluindo você.' : 'Informe de 1 a 8 assentos, sem contar o motorista.');
    return data;
  }
  async function createPost() {
    const key = `create:${state.userId}:${mode}`;
    if (locks.has(key)) return;
    let data;
    try { data = createData(); } catch (error) { el('#cmFormError').textContent = error.message; return; }
    const s = stamp(), form = el('#cmCreateForm');
    locks.add(key); form.querySelector('[type="submit"]').disabled = true; el('#cmFormError').textContent = '';
    try {
      const id = await rpc('campus_create', { p_mode: mode, p_data: data });
      if (!current(s)) return;
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Resposta inválida ao criar. Atualize o mural antes de tentar novamente.');
      drafts[mode] = {}; await openDetail(id);
    } catch (error) { if (current(s)) { el('#cmFormError').textContent = error.message; notice(error); } }
    finally { locks.delete(key); if (form.isConnected) form.querySelector('[type="submit"]').disabled = false; }
  }
  function detailShell() {
    shell(`<div id="cmDetailBody"><p class="cm-feedback" role="status">Carregando detalhes…</p></div><div id="cmDetailError" aria-live="polite"></div><div id="cmChat"></div>`);
    focusHeading();
  }
  async function openDetail(id) {
    view = 'detail'; viewVersion++; selectedId = id; detail = null; detailError = ''; detailShell();
    await loadDetail();
  }
  async function loadDetail(quiet = false) {
    if (!active || view !== 'detail' || !selectedId || (quiet && pollingRequest)) return;
    const s = stamp(), id = selectedId, request = ++detailVersion, token = {};
    pollingRequest = token;
    try {
      const data = await rpc('campus_detail', { p_post_id: id });
      if (!current(s) || selectedId !== id || request !== detailVersion) return;
      validPost(data);
      if (data.id !== id || !Array.isArray(data.members) || !Array.isArray(data.messages)) throw new Error('Detalhes inválidos. Tente novamente.');
      detail = data; detailError = ''; updateDetail();
    } catch (error) {
      if (!current(s) || request !== detailVersion) return;
      detailError = error.message;
      if (!detail) el('#cmDetailBody').innerHTML = '';
      el('#cmDetailError').innerHTML = errorBox(detailError, 'detail-retry');
      // An unverified detail cannot authorize a new participation or message.
      el('#cmDetailBody')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
      el('#cmChatForm')?.querySelectorAll('button, textarea').forEach(b => { b.disabled = true; });
      if (!quiet) notice(error);
    } finally {
      if (pollingRequest === token) pollingRequest = null;
    }
  }
  function updateDetail() {
    const p = detail, isMember = member(p), closed = ended(p), busy = locks.has(`post:${state.userId}:${p.id}`);
    el('#cmDetailError').innerHTML = '';
    el('#cmDetailBody').innerHTML = `<article class="cm-detail-card">${mode === 'study' ? `<span class="cm-subject">${esc(p.subject)}</span>` : `<div class="cm-route"><strong>${esc(p.origin)}</strong><span class="cm-route-direction" aria-label="para">${icon('arrow-right')}</span><strong>${esc(p.destination)}</strong></div>`}<h2>${esc(p.title)}</h2><p class="cm-description">${esc(p.description || 'Sem informações adicionais.')}</p><dl><dt>${mode === 'study' ? 'Encontro' : 'Saída'}</dt><dd>${esc(when(p.starts_at))}</dd><dt>${mode === 'study' ? 'Organização' : 'Motorista'}</dt><dd>${esc(p.owner_name || 'Integrante do campus')}</dd><dt>Encontro público</dt><dd>${esc(p.meeting_point || 'A combinar no chat')}</dd><dt>${mode === 'study' ? 'Participação' : 'Assentos'}</dt><dd>${esc(seats(p))}</dd></dl><p class="cm-status">${esc(status(p))}</p>${safety()}<div class="cm-actions">${p.is_owner ? `<button class="btn btn-outline" type="button" data-action="cancel" ${closed || busy ? 'disabled' : ''}>${esc(text().cancel)}</button>` : isMember ? `<button class="btn btn-outline" type="button" data-action="leave" ${busy || p.status === 'cancelled' ? 'disabled' : ''}>${esc(text().leave)}</button>` : `<button class="btn btn-primary cm-primary" type="button" data-action="join" ${closed || busy || p.member_count >= p.capacity ? 'disabled' : ''}>${esc(text().join)}</button>`}<button class="btn btn-outline" type="button" data-action="detail-retry">${icon('refresh')}Atualizar detalhes</button></div></article><section class="cm-roster"><h3>${mode === 'study' ? 'Integrantes do grupo' : 'Pessoas na viagem'}</h3>${isMember ? `<ul>${p.members.map(m => `<li>${esc(m.name || 'Integrante do campus')}${m.user_id === p.owner_id ? (mode === 'ride' ? ' · Motorista' : ' · Organizador') : ''}</li>`).join('') || '<li>Nenhum participante listado.</li>'}</ul>` : '<p>Entre para ver os participantes e conversar.</p>'}</section>`;
    if (!isMember) { el('#cmChat').innerHTML = ''; return; }
    if (!el('#cmChatForm')) {
      el('#cmChat').innerHTML = `<section class="cm-chat-panel"><h3>${esc(text().chat)}</h3><p>Somente participantes. Conversa separada do Spark de encontros.</p><div id="cmMessages" role="log" aria-label="${esc(text().chat)}" aria-live="polite"></div><form id="cmChatForm" class="cm-composer"><label class="field cm-compose-field">Mensagem<textarea name="content" id="cmChatInput" maxlength="2000" rows="2" required>${esc(chatDrafts[`${mode}:${p.id}`] || '')}</textarea></label><button type="submit" class="btn btn-primary cm-primary cm-send" aria-label="Enviar mensagem">${icon('send')}<span class="cm-sr-only">Enviar mensagem</span></button><p id="cmChatStatus" role="status"></p></form></section>`;
    }
    const log = el('#cmMessages');
    const markup = p.messages.map(m => `<article class="bubble cm-message ${m.sender_id === state.userId ? 'sent' : 'received'}"><strong>${esc(m.sender_name || 'Integrante do campus')}</strong><p>${esc(m.content)}</p><time datetime="${esc(m.created_at || '')}">${Number.isFinite(Date.parse(m.created_at)) ? esc(when(m.created_at)) : ''}</time></article>`).join('') || '<p>A conversa começa aqui.</p>';
    if (log.innerHTML !== markup) log.innerHTML = markup;
    el('#cmChatInput').disabled = closed;
    el('#cmChatForm [type="submit"]').disabled = closed || locks.has(`send:${state.userId}:${p.id}`);
    el('#cmChatStatus').textContent = closed ? 'Publicação cancelada ou encerrada: novas mensagens indisponíveis.' : '';
  }
  async function sendMessage() {
    if (!detail || !member(detail) || ended(detail) || detailError) return;
    const key = `send:${state.userId}:${detail.id}`;
    if (locks.has(key)) return;
    const input = el('#cmChatInput'), content = input.value.trim(), draftKey = `${mode}:${detail.id}`;
    chatDrafts[draftKey] = input.value;
    if (!content || content.length > 2000) { el('#cmChatStatus').textContent = 'Escreva de 1 a 2000 caracteres.'; return; }
    const s = stamp(), id = detail.id, original = input.value;
    locks.add(key); el('#cmChatForm [type="submit"]').disabled = true;
    try {
      await rpc('campus_send', { p_post_id: id, p_content: content });
      if (!current(s)) return;
      if (input.value === original) { input.value = ''; chatDrafts[draftKey] = ''; }
      await loadDetail();
    } catch (error) { if (current(s)) { el('#cmChatStatus').textContent = error.message; notice(error); } }
    finally { locks.delete(key); if (current(s) && el('#cmChatForm')) el('#cmChatForm [type="submit"]').disabled = ended(detail) || !!detailError; }
  }
  function hideModal(restore = true) {
    const previous = modal?.previous;
    if (modal && document.getElementById('modeBar')) document.getElementById('modeBar').inert = modal.headerInert;
    modal = null;
    el('.cm-modal-host')?.replaceChildren();
    if (el('.cm-content')) el('.cm-content').inert = false;
    if (restore && previous?.isConnected) previous.focus();
  }
  function confirmAction(action) {
    if (!detail || detailError || locks.has(`post:${state.userId}:${detail.id}`)) return;
    const header = document.getElementById('modeBar');
    modal = { action, previous: document.activeElement, headerInert: header?.inert || false };
    if (header) header.inert = true;
    el('.cm-content').inert = true;
    el('.cm-modal-host').innerHTML = `<div class="cm-modal-backdrop"><section class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cmDialogTitle" aria-describedby="cmDialogText" tabindex="-1"><h2 id="cmDialogTitle">${esc(action === 'cancel' ? text().cancel : text().leave)}?</h2><p id="cmDialogText">${action === 'cancel' ? 'O cancelamento afeta todos os participantes. Ninguém poderá entrar ou enviar novas mensagens. Esta ação não pode ser desfeita.' : mode === 'study' ? 'Você sairá do grupo e perderá acesso à conversa. Sua vaga ficará livre.' : 'Seu assento ficará disponível para outra pessoa e você perderá acesso à conversa da viagem.'}</p><p class="cm-inline-error" id="cmDialogError" role="alert"></p><div class="cm-actions"><button class="btn btn-outline" type="button" data-action="dismiss">Manter como está</button><button class="btn btn-danger cm-danger" type="button" data-action="confirm">${action === 'cancel' ? 'Confirmar cancelamento' : 'Confirmar saída'}</button></div></section></div>`;
    el('[data-action="dismiss"]').focus();
  }
  async function mutate(action) {
    if (!detail || detailError) return;
    const p = detail, key = `post:${state.userId}:${p.id}`;
    if (locks.has(key) || (action === 'join' && (ended(p) || member(p) || p.member_count >= p.capacity)) || (action === 'cancel' && (!p.is_owner || ended(p))) || (action === 'leave' && (p.is_owner || !p.is_member || p.status === 'cancelled'))) return;
    const s = stamp(); locks.add(key);
    root.querySelectorAll('#cmDetailBody button, .cm-dialog button').forEach(b => { b.disabled = true; });
    try {
      await rpc(`campus_${action}`, { p_post_id: p.id });
      if (!current(s)) return;
      hideModal(false); await loadDetail();
      if (current(s) && !detailError) { showToast(action === 'join' ? (mode === 'ride' ? 'Assento reservado.' : 'Você entrou no grupo.') : action === 'cancel' ? 'Publicação cancelada.' : 'Participação encerrada.', 'success'); focusHeading(); }
    } catch (error) {
      if (current(s)) { if (el('#cmDialogError')) el('#cmDialogError').textContent = error.message; notice(error); }
    } finally {
      locks.delete(key);
      if (current(s)) { if (detail && !detailError) updateDetail(); el('.cm-dialog')?.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
    }
  }
  function back() {
    saveCreateDraft(); hideModal(false); view = 'list'; viewVersion++; detail = null; selectedId = null;
    listShell(); focusHeading(); loadList();
  }
  function onClick(event) {
    const b = event.target.closest('button[data-action]');
    if (!b || b.disabled || !active) return;
    switch (b.dataset.action) {
      case 'create': createView(); break;
      case 'back': back(); break;
      case 'refresh': loadList(); break;
      case 'discover': case 'mine': tab = b.dataset.action; renderList(); break;
      case 'detail': openDetail(b.dataset.id); break;
      case 'detail-retry': loadDetail(); break;
      case 'join': mutate('join'); break;
      case 'cancel': case 'leave': confirmAction(b.dataset.action); break;
      case 'dismiss': hideModal(); break;
      case 'confirm': if (modal) mutate(modal.action); break;
    }
  }
  function onKey(event) {
    if (!active || !modal) return;
    if (event.key === 'Escape') { event.preventDefault(); hideModal(); }
    if (event.key === 'Tab') {
      const buttons = [...el('.cm-dialog').querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); el('.cm-dialog').focus(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  function refresh() {
    if (!active || !visible()) return;
    if (view === 'detail') return loadDetail();
    if (view === 'list') return loadList();
  }
  function init() {
    const nextRoot = document.getElementById('campusRoot');
    if (!nextRoot || nextRoot === root) return;
    root = nextRoot;
    root.addEventListener('click', onClick);
    root.addEventListener('input', event => {
      if (event.target.id === 'cmSearch') { query = event.target.value; renderList(); }
      else if (event.target.id === 'cmChatInput' && detail) chatDrafts[`${mode}:${detail.id}`] = event.target.value;
      else if (event.target.closest('#cmCreateForm')) saveCreateDraft();
    });
    root.addEventListener('submit', event => { event.preventDefault(); if (event.target.id === 'cmCreateForm') createPost(); if (event.target.id === 'cmChatForm') sendMessage(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (visible() && view === 'detail') loadDetail(true); });
  }
  function deactivate() {
    active = false; epoch++; viewVersion++; clearInterval(timer); timer = null; hideModal(false);
    posts = []; detail = null; selectedId = null; pollingRequest = null; root?.replaceChildren();
  }
  function open(nextMode) {
    init();
    if (!root || !copy[nextMode]) return;
    saveCreateDraft(); deactivate();
    if (account !== state.userId) { drafts = { study: {}, ride: {} }; chatDrafts = {}; account = state.userId; }
    active = true; mode = nextMode; view = 'list'; tab = 'discover'; query = ''; listLoading = false; listError = ''; detailError = '';
    listShell(); focusHeading(); loadList();
    timer = setInterval(() => { if (visible() && view === 'detail' && detail && !modal && !locks.has(`post:${state.userId}:${detail.id}`) && !locks.has(`send:${state.userId}:${detail.id}`)) loadDetail(true); }, 15000);
  }
  function close() { deactivate(); mode = null; drafts = { study: {}, ride: {} }; chatDrafts = {}; account = null; }
  window.CampusModes = Object.freeze({ init, open, close, refresh });
})();
