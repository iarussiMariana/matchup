(() => {
  'use strict';
  const URL = 'https://drvqiiddgcgvmbbnwdky.supabase.co';
  const KEY = 'sb_publishable_Vis5e7586v8GVIRo3_CVIg_Yd7O21_k';
  const app = document.getElementById('app');
  const main = document.getElementById('main');
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    book: '<path d="M3 5c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2zM12 7v14"/>',
    explore: '<path d="m15.5 8.5-2 5-5 2 2-5z"/><circle cx="12" cy="12" r="9"/>',
    request: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3h6v3H9zM9 12h6M9 16h4"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2v-9a9 9 0 1 1 19-2Z"/><path d="M7 10h9M7 14h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    send: '<path d="m21 3-7 18-4-8-8-3zM10 13 21 3"/>',
    shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM9 9l6 6M15 9l-6 6"/>',
    cap: '<path d="m2 9 10-5 10 5-10 5zM6 12v5c4 3 8 3 12 0v-5M22 9v7"/>',
    home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    group: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.book}</svg>`;
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(s => Array.from(s)[0] || '').join('').toUpperCase();
  const formatName = value => ({ presencial: 'Presencial', online: 'Online', hibrido: 'Híbrido' }[value] || 'A combinar');
  const statusName = value => ({ pending: 'Aguardando resposta', accepted: 'Aceita', declined: 'Recusada' }[value] || 'Indisponível');
  const studyPreference = value => ({ individual: 'Individualmente', grupo: 'Em grupo', ambos: 'Individualmente ou em grupo' }[value] || 'Individualmente ou em grupo');
  const chips = values => `<div class="chips">${(Array.isArray(values) ? values : []).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>`;
  const safePhoto = value => {
    try {
      const url = new window.URL(value);
      return url.origin === URL && /^\/storage\/v1\/object\/public\/photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(url.pathname) && !url.search && !url.hash ? url.href : '';
    } catch { return ''; }
  };
  const state = {
    user: null, profile: null, catalog: null, view: 'home', epoch: 0, authTab: 'login', recovery: false, onboardingStep: 0,
    profiles: [], requests: [], filter: '', filters: {}, direction: 'incoming', chat: null, messages: [],
    drafts: new Map(), outbox: new Map(), pending: new Set(), controllers: new Set(),
    profileDraft: null, photoFile: null, poll: null, toastTimer: null, loading: false, chatDenied: false, revision: 0, homeMetrics: { completedSessions: null, averageRating: null, reviewCount: 0, unreadNotifications: 0 }
  };
  let client;
  let recoveryFromURL = /(?:[?#&])type=recovery(?:&|$)/.test(location.href);
  let lastSessionUser = null;
  const active = epoch => state.epoch === epoch;
  const failure = text => Object.assign(new Error(text), { publicMessage: text });
  const isDenied = error => ['42501', 'PGRST116', 'PT403', 'PT404'].includes(error?.code) || /blocked|not allowed|permission denied|access denied|request not found|profile not found|conversation unavailable|not accepted|bloquead|conversa indispon[ií]vel|solicita[çc][aã]o n[aã]o encontrad|acesso negado/i.test(error?.message || '');
  function friendly(error) {
    if (error?.publicMessage) return error.publicMessage;
    if (['PGRST202', '42883', '42P01'].includes(error?.code) || /schema cache|function.*does not exist/i.test(error?.message || '')) return 'O MatchUp ainda não foi habilitado neste servidor. Peça ao responsável para aplicar a migração de monitoria no Supabase e tente novamente.';
    if (isDenied(error)) return 'Este conteúdo não está mais disponível para sua conta. Atualize a lista para continuar.';
    if (/invalid login|invalid_credentials/i.test(`${error?.code} ${error?.message}`)) return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
    if (/email.*confirm/i.test(error?.message || '')) return 'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.';
    if (/already registered|user_already_exists/i.test(`${error?.code} ${error?.message}`)) return 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.';
    if (/rate|too many/i.test(`${error?.code} ${error?.message}`)) return 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.';
    if (['23505', 'PT409'].includes(error?.code)) return 'Já existe uma solicitação para esta disciplina. Atualize Solicitações para consultar o status.';
    if (/password.*(weak|short)|weak_password/i.test(`${error?.code} ${error?.message}`)) return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.';
    if (error?.code === '22023') return 'Confira os campos e os limites informados antes de salvar.';
    return 'Não foi possível concluir. Confira sua conexão e tente novamente. Seus dados digitados foram mantidos.';
  }
  function toast(text) {
    const el = $('#toast'); el.textContent = text; el.classList.remove('hidden');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.add('hidden'), 4800);
  }
  function notice(target, text, error = true) {
    if (!target) return;
    target.innerHTML = `<div class="notice${error ? ' error' : ''}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;
  }
  function loading(text = 'Carregando…', layout = '') {
    const skeleton = ['list', 'card', 'messages'].includes(layout) ? layout : '';
    const shapes = skeleton ? `<div class="skeleton skeleton-${skeleton}" aria-hidden="true">${Array.from({ length: skeleton === 'card' ? 1 : 3 }, () => '<div class="skeleton-item"><span class="skeleton-avatar"></span><span class="skeleton-lines"><span></span><span></span><span></span></span></div>').join('')}</div>` : '';
    return `<div class="loading${skeleton ? ' loading-skeleton' : ''}" role="status"><div class="loading-label"><span class="spinner" aria-hidden="true"></span><span>${esc(text)}</span></div>${shapes}</div>`;
  }
  function empty(title, text, action, label, name = 'book') {
    return `<section class="empty"><div class="empty-icon">${icon(name)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>${action ? `<button class="btn soft" data-action="${action}">${esc(label)}</button>` : ''}</section>`;
  }
  function errorView(error, retry) {
    main.innerHTML = `<div class="intro"><p class="eyebrow">Vamos tentar de novo</p><h1>Uma pausa na conexão.</h1></div><div class="notice error" role="alert">${esc(friendly(error))}</div><button class="btn primary" id="retryView">${icon('refresh')}Tentar novamente</button>`;
    $('#retryView').onclick = retry;
  }
  function cancelReads() {
    for (const controller of state.controllers) controller.abort();
    state.controllers.clear(); clearInterval(state.poll); state.poll = null;
  }
  function invalidate() { state.epoch++; cancelReads(); state.cardLayout?.disconnect(); releasePhotoPreview(); closeDialog(); window.MentorAcademic?.cleanup?.(); return state.epoch; }
  async function rpc(name, args = {}, options = {}) {
    const controller = new AbortController();
    if (!options.mutation) state.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await client.rpc(name, args).abortSignal(controller.signal);
      if (result.error) throw result.error;
      return result.data;
    } finally { clearTimeout(timeout); state.controllers.delete(controller); }
  }
  function nav() {
    $('.bottom-nav')?.remove();
    const header = $('.topbar');
    const signedIn = state.user && state.profile && !state.recovery;
    app.classList.toggle('signed-in', Boolean(signedIn));
    const photo = safePhoto(state.profile?.photo_url);
    header.innerHTML = `<div class="brand"><img class="brand-mark" src="assets/brand/matchup-symbol.png" alt="" width="40" height="40">MatchUp<span class="sr-only"> — Conexões acadêmicas que funcionam</span></div>${signedIn ? `<div class="top-actions"><button class="icon-btn notification-button" data-action="notifications" aria-label="Notificações">${icon('bell')}<span class="notification-dot ${state.homeMetrics.unreadNotifications > 0 ? '' : 'hidden'}" aria-hidden="true"></span></button><button class="avatar-mini" data-action="profile" aria-label="Abrir meu perfil">${photo ? `<img decoding="async" src="${esc(photo)}" alt="">` : esc(initials(state.profile.name))}</button></div>` : '<span class="top-label">entre estudantes</span>'}${signedIn && state.view === 'home' ? `<div class="header-welcome"><p>Olá, ${esc(state.profile.name.split(' ')[0])}! <span aria-hidden="true">👋</span></p><h1>Bem-vindo de volta</h1></div>` : ''}`;
    if (!state.user || !state.profile || state.recovery) return;
    const items = [['home', 'Início', 'home'], ['explore', 'Descobrir', 'explore'], ['chats', 'Chat', 'chat'], ['agenda', 'Agenda', 'calendar'], ['profile', 'Perfil', 'user']];
    app.insertAdjacentHTML('beforeend', `<nav class="bottom-nav" aria-label="Navegação principal">${items.map(([view, label, image]) => `<button class="nav-item" data-nav="${view}" ${state.view === view || (state.view === 'requests' && view === 'chats') || (['groups','notifications'].includes(state.view) && view === 'home') ? 'aria-current="page"' : ''}>${icon(image)}<span>${label}</span></button>`).join('')}</nav>`);
  }
  function clearPrivate() {
    invalidate(); state.user = null; state.profile = null; state.catalog = null; state.profileDraft = null; state.photoFile = null;
    state.profiles = []; state.requests = []; state.messages = []; state.chat = null; state.drafts.clear(); state.outbox.clear();
    state.filter = ''; state.filters = {}; state.direction = 'incoming'; state.chatDenied = false; state.onboardingStep = 0; lastSessionUser = null; state.homeMetrics = { completedSessions: null, averageRating: null, reviewCount: 0, unreadNotifications: 0 };
    window.MentorAcademic?.reset?.();
    clearTimeout(state.toastTimer); $('#toast').classList.add('hidden');
  }
  async function sessionChanged(session, recovery = false) {
    if (!session?.user) { clearPrivate(); state.recovery = false; authView(); return; }
    if (lastSessionUser === session.user.id && !recovery) return;
    clearPrivate(); state.user = session.user; lastSessionUser = session.user.id;
    state.recovery = recovery || recoveryFromURL; recoveryFromURL = false;
    if (state.recovery) { recoveryView(); return; }
    await loadOwnProfile();
  }
  async function loadOwnProfile() {
    const epoch = invalidate(); nav(); main.innerHTML = loading('Preparando seu perfil acadêmico…');
    try {
      const profile = await rpc('mentor_me');
      if (!active(epoch)) return;
      state.profile = profile;
      if (!profile) { state.view = 'profile'; profileView(); }
      else navigate('home', false);
    } catch (error) { if (active(epoch)) { errorView(error, loadOwnProfile); main.insertAdjacentHTML('beforeend', '<button class="text-btn full" data-action="logout">Sair da conta</button>'); } }
  }
  function authView() {
    nav(); main.className = 'auth-main';
    const signup = state.authTab === 'signup', reset = state.authTab === 'reset';
    main.innerHTML = `<div class="intro"><p class="eyebrow">Conexões acadêmicas que funcionam</p><h1>Aprenda com quem sabe.<br><em>Ensine o que você domina.</em></h1><p>Encontre quem explica de um jeito que faz sentido. Compartilhe o que você sabe.</p></div><div class="auth-art"><img class="auth-logo" src="assets/brand/matchup-logo.png" alt="MatchUp — Conexões acadêmicas que funcionam"></div>${reset ? '<h2 class="section-title">Recuperar senha</h2><p class="muted">Enviaremos um link para o seu e-mail.</p>' : `<div class="segmented auth-tabs" aria-label="Acesso à conta"><button type="button" data-auth="login" aria-pressed="${!signup}">Entrar</button><button type="button" data-auth="signup" aria-pressed="${signup}">Criar conta</button></div>`}<div id="authNotice"></div><form id="authForm" class="stack">${signup ? '<div class="field"><label for="authName">Seu nome</label><input id="authName" name="name" autocomplete="name" minlength="2" maxlength="80" required></div><div class="field"><label for="birthDate">Data de nascimento</label><input id="birthDate" name="birth_date" type="date" required aria-describedby="adultHint"><small id="adultHint">O MatchUp é para estudantes com 18 anos ou mais.</small></div>' : ''}<div class="field"><label for="authEmail">E-mail</label><input id="authEmail" name="email" type="email" autocomplete="email" maxlength="254" required></div>${reset ? '' : `<div class="field"><label for="authPassword">Senha</label><input id="authPassword" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" maxlength="128" required>${signup ? '<small>Use pelo menos 8 caracteres.</small>' : ''}</div>`}<button class="btn primary full" type="submit">${reset ? 'Enviar link de recuperação' : signup ? 'Criar minha conta' : 'Entrar no MatchUp'}${icon('arrow')}</button></form><button type="button" class="text-btn full" data-auth="${reset ? 'login' : 'reset'}">${reset ? 'Voltar para entrar' : 'Esqueci minha senha'}</button><p class="auth-footnote">Um espaço de apoio entre estudantes · 18+<br>Uma conta para aprender e ensinar. Requer internet.</p>`;
    $('#authForm').onsubmit = submitAuth;
    if (signup) $('#birthDate').max = adultCutoff();
  }
  function adultCutoff() { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function adultBirthday(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(+date) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value && value >= '1900-01-01' && value <= adultCutoff();
  }
  async function submitAuth(event) {
    event.preventDefault(); if (state.pending.has('auth')) return;
    const form = event.currentTarget, data = new FormData(form), tab = state.authTab, epoch = state.epoch;
    if (tab === 'signup' && !adultBirthday(data.get('birth_date'))) { notice($('#authNotice'), 'Informe uma data válida. É necessário ter 18 anos ou mais.'); return; }
    state.pending.add('auth'); form.querySelector('button').disabled = true; $('#authNotice').innerHTML = '';
    try {
      let result;
      if (tab === 'reset') {
        const redirectTo = /^https?:$/.test(location.protocol) && !['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.origin}${location.pathname}` : undefined;
        result = await client.auth.resetPasswordForEmail(data.get('email').trim(), redirectTo ? { redirectTo } : {});
      } else if (tab === 'signup') result = await client.auth.signUp({ email: data.get('email').trim(), password: data.get('password'), options: { data: { name: data.get('name').trim(), birth_date: data.get('birth_date') } } });
      else result = await client.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') });
      if (result.error) throw result.error;
      if (!active(epoch)) return;
      if (tab === 'reset') notice($('#authNotice'), 'Se houver uma conta para este e-mail, você receberá o link. Confira sua caixa de entrada e a pasta de spam.', false);
      else if (result.data?.session) await sessionChanged(result.data.session);
      else notice($('#authNotice'), 'Conta criada. Confirme seu e-mail pelo link recebido e depois entre no MatchUp.', false);
    } catch (error) { if (active(epoch)) notice($('#authNotice'), friendly(error)); }
    finally { state.pending.delete('auth'); if (form.isConnected) form.querySelector('button').disabled = false; }
  }
  function securityDialog() {
    const epoch = state.epoch;
    const node = dialog('Segurança da conta', `<p>Enviaremos um link de recuperação para <strong>${esc(state.user.email)}</strong>. Nunca compartilhe sua senha.</p><div id="securityNotice"></div><button class="btn primary full section-title" id="securityReset">Receber link para alterar senha</button>`);
    $('#securityReset').onclick = async event => {
      if (state.pending.has('security')) return;
      const button = event.currentTarget; button.disabled = true; state.pending.add('security');
      try {
        const redirectTo = /^https?:$/.test(location.protocol) && !['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.origin}${location.pathname}` : undefined;
        const result = await client.auth.resetPasswordForEmail(state.user.email, redirectTo ? { redirectTo } : {});
        if (result.error) throw result.error;
        if (active(epoch) && node.isConnected) notice($('#securityNotice'), 'Se o e-mail puder receber a recuperação, o link chegará em breve. Confira sua caixa de entrada e spam.', false);
      } catch (error) { if (active(epoch) && node.isConnected) notice($('#securityNotice'), friendly(error)); }
      finally { state.pending.delete('security'); button.disabled = false; }
    };
  }
  function recoveryView() {
    nav(); main.className = 'auth-main';
    main.innerHTML = `<div class="intro"><p class="eyebrow">Sua conta</p><h1>Um novo acesso.</h1><p>Defina uma nova senha para voltar a aprender.</p></div><div id="recoveryNotice"></div><form id="recoveryForm" class="stack"><div class="field"><label for="newPassword">Nova senha</label><input id="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><div class="field"><label for="confirmPassword">Confirmar nova senha</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><button class="btn primary">Salvar nova senha</button></form><button class="text-btn full" data-action="logout">Sair da recuperação</button>`;
    $('#recoveryForm').onsubmit = async event => {
      event.preventDefault(); if (state.pending.has('recovery')) return;
      const form = event.currentTarget, epoch = state.epoch;
      if ($('#newPassword').value !== $('#confirmPassword').value) { notice($('#recoveryNotice'), 'As senhas precisam ser iguais.'); return; }
      state.pending.add('recovery'); form.querySelector('button').disabled = true;
      try {
        const result = await client.auth.updateUser({ password: $('#newPassword').value });
        if (result.error) throw result.error;
        if (!active(epoch)) return;
        state.recovery = false; history.replaceState(null, '', location.pathname); toast('Senha atualizada.'); await loadOwnProfile();
      } catch (error) { if (active(epoch)) notice($('#recoveryNotice'), friendly(error)); }
      finally { state.pending.delete('recovery'); if (form.isConnected) form.querySelector('button').disabled = false; }
    };
  }
  async function logout() {
    if (state.pending.has('logout')) return;
    state.pending.add('logout'); const epoch = invalidate();
    main.innerHTML = loading('Saindo com segurança…');
    try {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      clearPrivate(); state.recovery = false; authView();
    } catch (error) { if (active(epoch)) errorView(failure('Não foi possível encerrar a sessão. Tente sair novamente.'), logout); }
    finally { state.pending.delete('logout'); }
  }
  function navigate(view, focus = true, context = {}) {
    view = ({ discover: 'explore', chat: 'chats', inicio: 'home', perfil: 'profile' })[view] || view;
    if (!state.user || state.pending.has('logout')) return;
    if (!state.profile) view = 'profile';
    invalidate(); state.view = view; state.chat = null; state.chatDenied = false; state.messages = [];
    main.className = ''; nav();
    if (view === 'profile') profileView();
    else if (view === 'home') homeView();
    else if (view === 'explore') exploreView();
    else if (view === 'favorites') window.MentorProduct.renderFavorites(main);
    else if (['agenda', 'groups', 'notifications'].includes(view)) academicView(view, context);
    else requestView();
    if (focus) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  function ownDraft() {
    return state.profileDraft || {
      id: state.user.id, name: state.profile?.name || state.user.user_metadata?.name || '',
      course: state.profile?.course || '', semester: state.profile?.semester || 1, bio: state.profile?.bio || '',
      catalog_course_id: state.profile?.catalog_course_id || null,
      subjects: [...(state.profile?.subjects || [])], learning_subjects: [...(state.profile?.learning_subjects || [])],
      availability: state.profile?.availability || '', format: state.profile?.format || 'hibrido',
      photo_url: safePhoto(state.profile?.photo_url), active: state.profile?.active || false,
      institution: state.profile?.institution || (state.profile ? '' : 'FACENS'), city: state.profile?.city || '',
      current_subjects: [...(state.profile?.current_subjects || [])], topics: (state.profile?.topics || []).join(', '),
      study_preference: state.profile?.study_preference || 'ambos',
      methodology: state.profile?.methodology || '', experience: state.profile?.experience || '', availability_slots: [...(state.profile?.availability_slots || [])]
    };
  }
  async function loadCatalog() {
    if (state.catalog) return state.catalog;
    const epoch = state.epoch, data = window.MentorCatalog.validate(await rpc('mentor_catalog'));
    if (!active(epoch)) throw failure('A tela foi alterada. Abra o perfil novamente.');
    state.catalog = data; return data;
  }
  function releasePhotoPreview() {
    if (state.photoPreview) window.URL.revokeObjectURL(state.photoPreview);
    state.photoPreview = null;
  }
  function profilePhotoMarkup() {
    return `<section class="profile-photo" aria-labelledby="profilePhotoTitle"><div id="profilePhotoPreview" class="profile-photo-frame"></div><div class="profile-photo-controls"><h2 id="profilePhotoTitle">Sua foto de perfil</h2><p>Um rosto ajuda a criar conexões. É opcional.</p><label class="sr-only" for="photo">Foto de perfil (opcional)</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photoHint profilePhotoStatus" hidden><button class="btn secondary" type="button" id="choosePhoto">Adicionar foto</button><button class="text-btn" type="button" id="removePhoto" hidden>Remover foto do perfil</button></div><small id="photoHint">JPG, PNG ou WebP, até 5 MB. Redimensionada para até 640 px antes do envio. A foto só muda ao salvar o perfil; sem foto, mostramos suas iniciais.</small><p id="profilePhotoStatus" class="muted" role="status" aria-live="polite"></p></section>`;
  }
  function renderProfilePhoto() {
    const preview = $('#profilePhotoPreview'); if (!preview) return;
    releasePhotoPreview();
    const d = ownDraft();
    if (state.photoFile && !state.photoError) state.photoPreview = window.URL.createObjectURL(state.photoFile);
    const photo = state.photoPreview || safePhoto(d.photo_url);
    preview.innerHTML = `<span class="profile-photo-initials" aria-label="Sem foto de perfil">${esc(initials(d.name))}</span>${photo ? `<img class="photo-preview" src="${esc(photo)}" alt="Sua foto de perfil">` : ''}`;
    const image = preview.querySelector('img');
    if (image) {
      image.onload = () => { if (image.isConnected) preview.querySelector('span').hidden = true; };
      image.onerror = () => { if (!image.isConnected) return; image.hidden = true; preview.querySelector('span').hidden = false; $('#profilePhotoStatus').textContent = 'Não foi possível abrir a imagem. Escolha outra foto ou remova a atual.'; };
    }
    $('#choosePhoto').textContent = photo || state.photoFile ? 'Trocar foto' : 'Adicionar foto';
    $('#removePhoto').hidden = !photo && !state.photoFile;
    $('#profilePhotoStatus').textContent = state.photoFile ? (state.photoError || `Selecionada: ${state.photoFile.name}. Salve o perfil para publicar.`) : d.photo_url !== (state.profile?.photo_url || '') ? 'Alteração de foto pendente. Salve o perfil para confirmar.' : '';
  }
  async function selectProfilePhoto(file) {
    if (!file) return;
    const epoch = state.epoch, form = $('#profileForm');
    state.photoFile = file; state.photoError = ''; saveProfileDraft();
    try { await validatePhoto(file); }
    catch (error) { if (active(epoch) && state.photoFile === file && form.isConnected) state.photoError = friendly(error); }
    if (active(epoch) && state.photoFile === file && form.isConnected) renderProfilePhoto();
  }
  function profileView() {
    nav(); main.className = '';
    if (!state.catalog) {
      const epoch = state.epoch;
      main.innerHTML = loading('Carregando cursos e disciplinas da FACENS…');
      loadCatalog().then(() => { if (active(epoch)) profileView(); }).catch(error => {
        if (active(epoch)) {
          errorView(error, profileView);
          if (!state.profile) main.insertAdjacentHTML('beforeend', '<button class="text-btn full" data-action="logout">Sair da conta</button>');
        }
      });
      return;
    }
    const d = ownDraft(), onboarding = !state.profile, step = state.onboardingStep;
    const stepOpen = (index, title) => `<fieldset class="profile-step" ${onboarding && step !== Math.min(index, 1) ? 'hidden' : ''}>${onboarding ? `<legend>${title}</legend>` : ''}`;
    main.innerHTML = `<div class="intro"><p class="eyebrow">${onboarding ? 'Seu novo começo' : 'Meu espaço'}</p><h1>${onboarding ? 'O que vamos<br>aprender juntos?' : 'Seu conhecimento<br>tem lugar aqui.'}</h1><p>${onboarding ? 'Só nome, curso e semestre são obrigatórios. As matérias e preferências podem ser completadas depois.' : 'Conte sua trajetória. Aprenda, ensine ou faça os dois.'}</p></div>${onboarding ? '<div class="profile-note"><h3>Um perfil feito para o MatchUp</h3><p>Mesmo com uma conta existente, você precisa criar este perfil. Somente seu nome foi sugerido. Nada é publicado antes de você salvar.</p></div>' : ''}${onboarding ? `<div class="stepper" aria-hidden="true">${[0,1].map(i => `<span class="${i <= step ? 'complete' : ''}"></span>`).join('')}</div><p class="step-label">Etapa ${step + 1} de 2 · ${['Sua trajetória', 'Suas matérias e preferências'][step]}</p>` : ''}<div id="profileNotice"></div><form id="profileForm" class="stack">${stepOpen(0, 'Primeiro, um pouco sobre você')}${profilePhotoMarkup()}<div class="field"><label for="profileName">Nome no perfil</label><input id="profileName" name="name" autocomplete="name" minlength="2" maxlength="80" value="${esc(d.name)}" required></div><div class="field"><label for="institution">Instituição de ensino</label><input id="institution" name="institution" maxlength="120" value="${esc(d.institution)}" placeholder="Onde você estuda?" ></div><div class="field"><label for="city">Cidade</label><input id="city" name="city" maxlength="100" value="${esc(d.city)}" placeholder="Sua cidade" ></div><div class="fields-two"><div class="field"><label for="course">Curso</label><select id="course" aria-describedby="catalogCourseInfo" required></select></div><div class="field"><label for="semester">Semestre</label><input id="semester" name="semester" type="number" min="1" max="20" step="1" value="${esc(d.semester)}" required></div></div><div id="catalogCourseInfo" class="catalog-course-info"></div><div class="field"><label for="bio">Sobre seu aprendizado</label><textarea id="bio" name="bio" maxlength="1000" placeholder="Como você gosta de aprender ou explicar?">${esc(d.bio)}</textarea></div></fieldset>${stepOpen(1, 'O que você sabe e quer aprender?')}<p class="notice">Você pode ajudar em uma matéria e buscar apoio em outra. Seu papel é definido por disciplina, nunca de forma exclusiva.</p>${window.MentorCatalog.markup()}<div class="field"><label for="topics">Assuntos que quero aprender</label><input id="topics" name="topics" maxlength="1619" value="${esc(d.topics)}" placeholder="Ex.: Derivadas, Funções, Algoritmos"><small>Até 20 assuntos, separados por vírgulas. Até 80 caracteres por assunto.</small></div></fieldset>${stepOpen(2, 'Seu jeito de estudar')}${window.MentorProduct.profileMarkup(d)}<div class="field"><label for="studyPreference">Prefiro estudar</label><select id="studyPreference" name="study_preference">${['individual','grupo','ambos'].map(value => `<option value="${value}" ${d.study_preference === value ? 'selected' : ''}>${studyPreference(value)}</option>`).join('')}</select></div><div class="field"><label for="availability">Disponibilidade para estudar</label><input id="availability" name="availability" maxlength="160" value="${esc(d.availability)}" placeholder="Ex.: Durante a semana, à noite"><small>Uma indicação geral. Os detalhes são combinados na conversa.</small></div><div class="field"><label for="format">Formato de preferência</label><select id="format" name="format">${['presencial', 'online', 'hibrido'].map(value => `<option value="${value}" ${d.format === value ? 'selected' : ''}>${formatName(value)}</option>`).join('')}</select></div><label class="check" for="activeProfile"><input id="activeProfile" name="active" type="checkbox" ${d.active ? 'checked' : ''}><span>Estou disponível para oferecer monitoria<small>Publicar meu perfil em Descobrir. É preciso informar pelo menos uma disciplina em “Posso ajudar com”. Desmarcado, você ainda pode buscar apoio.</small></span></label></fieldset>${onboarding && step > 0 ? '<button class="btn secondary full" type="button" id="previousStep">Voltar uma etapa</button>' : ''}<button class="btn primary full" type="submit">${onboarding && step < 1 ? 'Continuar' : onboarding ? 'Salvar e começar' : 'Salvar perfil'}${icon(onboarding && step < 1 ? 'arrow' : 'check')}</button></form>${onboarding ? '' : '<section id="academicProfileReviews" aria-label="Feedback recebido"></section>'}${onboarding ? '' : '<section class="settings-links" aria-label="Configurações"><h2>Configurações</h2><button class="btn secondary full" data-action="notifications">Notificações</button><button class="btn secondary full" data-action="privacy">Privacidade</button><button class="btn secondary full" data-nav="favorites">Perfis salvos</button><button class="btn secondary full" data-action="safety">Segurança e denúncias</button><button class="btn secondary full" data-action="security">Segurança da conta</button></section>'}<div class="account-footer"><small>MatchUp · Conexões acadêmicas que funcionam</small><small>Conta: ${esc(state.user.email || '')}</small><button class="btn secondary full" data-action="logout">Sair da conta</button><small>Compartilhe apenas informações que deseja tornar visíveis a outros estudantes. Não publique dados sensíveis. Você pode ocultar seu perfil desmarcando a disponibilidade acima.</small></div>`;
    if (!onboarding) $('.settings-links').insertAdjacentHTML('beforeend', '<button class="btn secondary full" data-action="laboratory">Laboratório</button>');
    const form = $('#profileForm');
    window.MentorCatalog.mount(form, state.catalog, d, state.profile);
    form.oninput = saveProfileDraft;
    form.onchange = event => {
      if (event.target.id === 'photo') { selectProfilePhoto(event.target.files[0]); return; }
      saveProfileDraft();
    };
    renderProfilePhoto();
    $('#choosePhoto').onclick = () => $('#photo').click();
    $('#removePhoto').onclick = () => {
      saveProfileDraft(); state.profileDraft.photo_url = ''; state.photoFile = null; state.photoError = '';
      $('#photo').value = ''; renderProfilePhoto(); $('#choosePhoto').focus();
    };
    $('#previousStep')?.addEventListener('click', () => { saveProfileDraft(); state.onboardingStep--; profileView(); main.focus(); window.scrollTo(0, 0); });
    form.onsubmit = event => {
      if (!onboarding || step === 1) { saveProfile(event); return; }
      event.preventDefault(); saveProfileDraft();
      try {
        if (step === 1) { parseSubjects(state.profileDraft.subjects); parseSubjects(state.profileDraft.learning_subjects); parseSubjects(state.profileDraft.current_subjects, 12); parseSubjects(state.profileDraft.topics, 20, 'assuntos'); }
        state.onboardingStep++; profileView(); main.focus(); window.scrollTo(0, 0);
      } catch (error) { notice($('#profileNotice'), friendly(error)); }
    };
    if (!onboarding) mountReviews($('#academicProfileReviews'), state.user.id);
  }
  function mountReviews(container, userId) {
    if (!container || !window.MentorAcademic?.renderReviews) return;
    const epoch = state.epoch;
    Promise.resolve().then(() => active(epoch) && container.isConnected && window.MentorAcademic.renderReviews(container, userId)).catch(error => { if (active(epoch) && container.isConnected) notice(container, friendly(error)); });
  }
  function saveProfileDraft() {
    const form = $('#profileForm'); if (!form) return;
    const old = ownDraft(), values = Object.fromEntries(new FormData(form));
    state.profileDraft = { ...old, ...values, ...window.MentorCatalog.values(form), ...window.MentorProduct.fields(form), active: $('#activeProfile').checked };
  }
  function parseSubjects(value, max = 8, label = 'disciplinas') {
    const result = [], seen = new Set();
    for (const item of Array.isArray(value) ? value : String(value).split(',')) {
      const subject = item.trim(); if (!subject) continue;
      const limit = label === 'assuntos' ? 80 : 256;
      if ([...subject].length > limit) throw failure(`Cada item de ${label} pode ter no máximo ${limit} caracteres.`);
      const key = subject.toLocaleLowerCase('pt-BR'); if (!seen.has(key)) { result.push(subject); seen.add(key); }
    }
    if (result.length > max) throw failure(`Informe no máximo ${max} ${label} em cada lista.`);
    return result;
  }
  async function validatePhoto(file) {
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extension = extensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024 || !file.size) throw failure('Escolha uma imagem JPG, PNG ou WebP com até 5 MB.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!valid) throw failure('O conteúdo da foto não corresponde ao formato informado. Escolha outra imagem.');
  }
  async function uploadPhoto(file, userId) {
    await validatePhoto(file);
    const optimized = await window.MentorProduct.optimizePhoto(file);
    if (state.user?.id !== userId) throw failure('Sua conta mudou. Entre novamente antes de enviar a foto.');
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const result = await client.storage.from('photos').upload(path, optimized, { contentType: 'image/jpeg', upsert: false });
    if (result.error) throw result.error;
    return safePhoto(client.storage.from('photos').getPublicUrl(path).data.publicUrl);
  }
  async function saveProfile(event) {
    event.preventDefault(); if (state.pending.has('profile')) return;
    saveProfileDraft(); const form = event.currentTarget, epoch = state.epoch, userId = state.user.id, d = { ...state.profileDraft };
    state.pending.add('profile'); form.querySelector('[type=submit]').disabled = true; $('#profileNotice').innerHTML = '';
    form.querySelectorAll('.profile-photo button,.profile-photo input').forEach(control => { control.disabled = true; });
    try {
      const p = { id: userId, name: d.name.trim(), course: d.course.trim(), semester: Number(d.semester), bio: d.bio.trim(), subjects: parseSubjects(d.subjects), learning_subjects: parseSubjects(d.learning_subjects), availability: d.availability.trim(), format: d.format, photo_url: safePhoto(d.photo_url), active: d.active };
      Object.assign(p, { institution: d.institution.trim(), city: d.city.trim(), current_subjects: parseSubjects(d.current_subjects, 12), topics: parseSubjects(d.topics, 20, 'assuntos'), study_preference: d.study_preference || 'ambos' });
      Object.assign(p, { methodology: d.methodology, experience: d.experience, availability_slots: d.availability_slots });
      if (p.name.length < 2 || !p.course || p.course.length > 80 || p.availability.length > 160 || !Number.isInteger(p.semester) || p.semester < 1 || p.semester > 20) throw failure('Informe seu nome, curso (até 80 caracteres), disponibilidade (até 160) e um semestre inteiro entre 1 e 20.');
      if (p.active && !p.subjects.length) throw failure('Para oferecer monitoria, informe ao menos uma disciplina em “Posso ajudar com”.');
      if (state.photoFile) {
        p.photo_url = await uploadPhoto(state.photoFile, userId);
        if (!active(epoch)) return;
        state.profileDraft.photo_url = p.photo_url; state.photoFile = null;
      }
      const result = await rpc('mentor_save_product', { p_profile: p, p_course_id: d.catalog_course_id || null }, { mutation: true });
      if (!active(epoch)) return;
      state.profile = result; state.profileDraft = null;
      state.onboardingStep = 0; toast('Perfil acadêmico salvo.'); navigate('home');
    } catch (error) { if (active(epoch)) { notice($('#profileNotice'), friendly(error)); $('#profileNotice').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
    finally {
      state.pending.delete('profile');
      if (form.isConnected) form.querySelectorAll('[type=submit],.profile-photo button,.profile-photo input').forEach(control => { control.disabled = false; });
    }
  }
  function subjectCards(subjects, role, compact = false) {
    if (compact) return subjects.map(subject => `<article class="subject-card ${role === 'teach' ? 'teach' : 'help'}"><span class="role-label">${role === 'teach' ? 'Posso ajudar' : 'Preciso de ajuda'}</span><h3>${esc(subject)}</h3><button class="text-btn subject-link" data-subject-search="${esc(subject)}">Encontrar estudantes ${icon('arrow')}</button></article>`).join('');
    return subjects.map(subject => `<article class="subject-card ${role === 'teach' ? 'teach' : 'help'}"><span class="role-label">${role === 'teach' ? 'Posso ajudar' : role === 'learn' ? 'Preciso de ajuda' : 'Estou cursando'}</span><h3>${esc(subject)}</h3>${state.profile.institution ? `<small>${esc(state.profile.institution)}</small>` : ''}<button class="text-btn" data-subject-detail="${esc(subject)}">Ver assuntos de interesse ${icon('arrow')}</button><button class="btn soft full" data-subject-search="${esc(subject)}">Encontrar estudantes</button></article>`).join('');
  }
  function subjectArea() {
    state.view = 'home'; invalidate(); nav();
    const p = state.profile;
    main.innerHTML = `<div class="intro"><p class="eyebrow">Seu mapa de aprendizado</p><div class="row between"><h1>Minhas matérias</h1><button class="icon-btn" data-nav="home" aria-label="Voltar ao início">${icon('back')}</button></div><p>Você pode ensinar e aprender ao mesmo tempo. As matérias abaixo são escolhidas por você. Nenhuma nota ou nível de domínio é atribuído automaticamente.</p></div><h2 class="section-title">Preciso de ajuda</h2><div class="subject-grid">${subjectCards(p.learning_subjects || [], 'learn') || '<p class="home-subject-empty">Adicione as matérias em que você quer apoio no seu perfil.</p>'}</div><h2 class="section-title">Posso ajudar</h2><div class="subject-grid">${subjectCards(p.subjects || [], 'teach') || '<p class="home-subject-empty">Conte o que você sabe compartilhar no seu perfil.</p>'}</div><h2 class="section-title">Estou cursando</h2><div class="subject-grid">${subjectCards(p.current_subjects || [], 'current') || '<p class="home-subject-empty">Você ainda não informou as matérias atuais.</p>'}</div><button class="btn primary full section-title" data-action="profile">Editar minhas matérias</button>`;
  }
  function subjectDetail(subject) {
    dialog(subject, `<div class="subject-dialog"><p>Assuntos de interesse declarados no seu perfil:</p>${chips(state.profile.topics)}${state.profile.topics?.length ? '<small>São interesses gerais do seu perfil; a relação com esta matéria será combinada com o estudante.</small>' : '<p class="muted">Adicione assuntos específicos no seu perfil para explicar melhor o que deseja aprender.</p>'}<div class="dialog-actions"><button class="btn secondary" data-action="profile">Editar assuntos</button><button class="btn primary" data-subject-search="${esc(subject)}">Encontrar estudantes</button></div></div>`);
  }
  function updateHomeMetrics(values, epoch = state.epoch) {
    if (!active(epoch) || !state.user || !state.profile || !values) return;
    for (const key of ['completedSessions', 'reviewCount', 'unreadNotifications']) if (Number.isInteger(values[key]) && values[key] >= 0) state.homeMetrics[key] = values[key];
    if (values.averageRating === null || (Number.isFinite(values.averageRating) && values.averageRating >= 1 && values.averageRating <= 5)) state.homeMetrics.averageRating = values.averageRating;
    const m = state.homeMetrics;
    if ($('#homeSessionCount')) $('#homeSessionCount').textContent = m.completedSessions === null ? '—' : String(m.completedSessions);
    if ($('#homeRating')) $('#homeRating').textContent = m.averageRating !== null && m.reviewCount > 0 ? m.averageRating.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—';
    $('.notification-dot')?.classList.toggle('hidden', m.unreadNotifications === 0);
  }
  function nextSessionCard(session) {
    const date = session ? new Date(session.starts_at) : null, valid = date && Number.isFinite(+date);
    const title = valid ? [session.subject, session.topic].filter(Boolean).join(' — ') || session.title || 'Encontro de estudo' : 'Vamos aprender juntos?';
    const participant = valid && Array.isArray(session.participants) ? session.participants.find(item => {
      const id = item?.user_id || item?.profile?.id || item?.id;
      return id && id !== state.user.id && typeof (item.profile || item).name === 'string';
    }) : null;
    const peer = valid ? session.peer || participant?.profile || participant : null, photo = safePhoto(peer?.photo_url);
    const kind = valid && (session.group_id || session.study_preference === 'grupo') ? 'Em grupo' : valid && (session.request_id || session.study_preference === 'individual') ? 'Individual' : '';
    return `<article class="home-next"><div class="next-card-top"><span>Próxima sessão</span><span class="next-calendar" aria-hidden="true">${icon('calendar')}</span></div><h2>${esc(title)}</h2>${peer?.name ? `<div class="next-peer"><span class="next-avatar">${photo ? `<img decoding="async" src="${esc(photo)}" alt="">` : esc(initials(peer.name))}</span><span>${esc(peer.name)}</span></div>` : ''}<div class="next-card-bottom"><div class="next-details">${valid ? `<span>${icon('clock')}<time datetime="${esc(date.toISOString())}">${esc(date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</time></span>${kind ? `<span>${icon('user')}${esc(kind)}</span>` : ''}` : `<p>${session === null ? 'Nenhum encontro agendado. Combine um horário para estudar.' : 'Confira seus encontros e convites na agenda.'}</p>`}</div><button class="btn next-view" data-nav="agenda" aria-label="Ver agenda">Ver ${icon('arrow')}</button></div></article>`;
  }
  async function homeView() {
    const epoch = state.epoch, p = state.profile;
    state.homeMetrics = { completedSessions: null, averageRating: null, reviewCount: 0, unreadNotifications: 0 };
    const subjects = new Set([...(p.current_subjects || []), ...(p.subjects || []), ...(p.learning_subjects || [])].map(subject => subject.toLocaleLowerCase('pt-BR')));
    main.className = 'home';
    main.innerHTML = `<p class="sr-only">Aprenda com quem sabe. Ensine o que você domina.</p>
      <section id="academicHome">${nextSessionCard(undefined)}</section>
      <section class="home-stats" aria-label="Resumo acadêmico"><div class="stat-card stat-sessions">${icon('calendar')}<strong id="homeSessionCount">—</strong><span>Sessões concluídas</span></div><div class="stat-card stat-rating">${icon('star')}<strong id="homeRating">—</strong><span>Avaliação recebida</span></div><div class="stat-card stat-subjects">${icon('book')}<strong>${subjects.size}</strong><span>Matérias no perfil</span></div></section>
      <section class="home-subjects" aria-labelledby="homeLearning"><div class="section-heading"><h2 id="homeLearning">Preciso de ajuda</h2><button class="text-btn" data-action="subjects" aria-label="Ver todas as minhas matérias para aprender">Ver todas</button></div><div class="subject-grid">${subjectCards((p.learning_subjects || []).slice(0, 2), 'learn', true) || '<p class="home-subject-empty">Adicione ao perfil as matérias em que você quer apoio. <button class="text-btn" data-action="profile">Editar perfil</button></p>'}</div></section>
      <section class="home-subjects" aria-labelledby="homeTeaching"><div class="section-heading"><h2 id="homeTeaching">Posso ajudar</h2><button class="text-btn" data-action="subjects" aria-label="Ver todas as minhas matérias para ensinar">Ver todas</button></div><div class="subject-grid">${subjectCards((p.subjects || []).slice(0, 2), 'teach', true) || '<p class="home-subject-empty">Conte no perfil o que você pode ensinar. <button class="text-btn" data-action="profile">Editar perfil</button></p>'}</div></section>
      <div class="home-actions"><button class="home-action" data-action="requests">${icon('request')}<span>Solicitações</span></button><button class="home-action" data-action="groups">${icon('group')}<span>Grupos de estudo</span></button></div>
      <section class="home-people" aria-labelledby="homePeople"><div class="section-heading"><h2 id="homePeople">${p.learning_subjects?.length ? 'Pessoas compatíveis' : 'Conheça estudantes'}</h2><button class="text-btn" data-nav="explore">Ver todos</button></div><div id="homeSuggestions">${loading('Buscando estudantes…', 'list')}</div></section>`;
    updateHomeMetrics(state.homeMetrics, epoch);
    const renderHome = window.MentorAcademic?.renderHome || window.MentorAcademic?.renderHomeSummary;
    if (window.MentorAcademic?.nextSession) Promise.resolve().then(() => active(epoch) && window.MentorAcademic.nextSession()).then(session => {
      if (active(epoch) && $('#academicHome')) $('#academicHome').innerHTML = nextSessionCard(session);
    }).catch(error => { if (active(epoch) && $('#academicHome')) $('#academicHome').insertAdjacentHTML('beforeend', `<div class="notice error" role="alert">${esc(friendly(error))}</div>`); });
    else if (renderHome) Promise.resolve().then(() => active(epoch) && renderHome($('#academicHome'))).catch(error => { if (active(epoch) && $('#academicHome')) notice($('#academicHome'), friendly(error)); });
    try {
      const all = await rpc('mentor_discover_product', { p_subject: '' });
      if (!active(epoch)) return;
      const sought = new Set((p.learning_subjects || []).map(s => s.toLocaleLowerCase('pt-BR')));
      const score = candidate => (candidate.subjects || []).filter(s => sought.has(s.toLocaleLowerCase('pt-BR'))).length;
      const candidates = (all || []).filter(candidate => candidate.active && candidate.id !== p.id && (!sought.size || score(candidate) > 0)).sort((a, b) => score(b) - score(a)).slice(0, 3);
      $('#homeSuggestions').innerHTML = candidates.length ? `<div class="list">${candidates.map(candidate => `<article class="suggestion-card"><span class="avatar-mini" aria-hidden="true">${esc(initials(candidate.name))}</span><div class="grow"><h3>${esc(candidate.name)}</h3><small>${esc(candidate.course)}</small>${chips((candidate.subjects || []).filter(subject => !sought.size || sought.has(subject.toLocaleLowerCase('pt-BR'))).slice(0, 2))}<small>${esc(window.MentorProduct.reasons(candidate, p)[0] || 'Conheça o perfil e as disciplinas oferecidas.')}</small></div><button class="icon-btn" data-peer="${esc(candidate.id)}" aria-label="Conhecer ${esc(candidate.name)}">${icon('arrow')}</button></article>`).join('')}</div>` : empty('Novas conexões estão por vir.', 'Ainda não encontramos estudantes disponíveis nas matérias do seu perfil. Explore outras disciplinas ou atualize seus interesses acadêmicos.', 'explore', 'Descobrir estudantes');
    } catch (error) { if (active(epoch)) $('#homeSuggestions').innerHTML = `<div class="notice error" role="alert">${esc(friendly(error))}</div><button class="btn secondary full" data-action="home">Tentar novamente</button>`; }
  }
  function academicView(view, context = {}) {
    main.className = '';
    const method = view === 'groups' && context.groupId ? 'renderGroup' : { agenda: 'renderAgenda', groups: 'renderGroups', notifications: 'renderNotifications' }[view];
    const handler = window.MentorAcademic?.[method];
    if (!handler) { main.innerHTML = empty('Estamos preparando este espaço.', 'Este recurso precisa do módulo acadêmico instalado. Atualize o aplicativo e tente novamente.', 'home', 'Voltar ao início'); return; }
    const epoch = state.epoch; main.innerHTML = loading();
    Promise.resolve().then(() => active(epoch) && handler(main, context.groupId)).catch(error => { if (active(epoch)) errorView(error, () => navigate(view, true, context)); });
  }
  async function exploreView() {
    const epoch = state.epoch;
    main.className = 'discovery';
    main.innerHTML = `<div class="discovery-heading"><h1>Descobrir</h1><button class="text-btn" data-nav="favorites">${icon('star')}Perfis salvos</button></div><form id="searchForm" class="search" role="search"><div class="input-wrap">${icon('search')}<label class="sr-only" for="subjectSearch">Buscar disciplina</label><input id="subjectSearch" type="search" maxlength="256" placeholder="Buscar disciplina" value="${esc(state.filter)}"></div><button class="btn soft" type="submit" aria-label="Buscar">${icon('arrow')}</button><button class="icon-btn" type="button" data-action="refresh" aria-label="Atualizar monitores">${icon('refresh')}</button></form><div id="discoverContent">${loading('Buscando monitores…', 'card')}</div>`;
    $('#searchForm').onsubmit = event => { event.preventDefault(); state.filter = $('#subjectSearch').value.trim(); state.filters = Object.fromEntries(new FormData(event.currentTarget)); navigate('explore', false); };
    try {
      const [profiles, catalog] = await Promise.all([rpc('mentor_discover_product', { p_subject: state.filter, p_course_id: state.filters.course || null, p_semester: state.filters.semester ? Number(state.filters.semester) : null, p_format: state.filters.format || null, p_slot: state.filters.slot || null, p_favorites_only: false }), loadCatalog()]);
      if (!active(epoch)) return;
      $('#searchForm').insertAdjacentHTML('beforeend', window.MentorProduct.filtersMarkup(state.filters, catalog));
      state.profiles = (profiles || []).filter(p => p.active && p.id !== state.user.id); renderCard();
    } catch (error) {
      if (!active(epoch)) return;
      $('#discoverContent').innerHTML = `<div class="notice error" role="alert">${esc(friendly(error))}</div><button class="btn primary full" data-action="refresh">Tentar novamente</button>`;
    }
  }
  function renderCard() {
    state.cardLayout?.disconnect();
    const target = $('#discoverContent'); if (!target) return;
    const p = state.profiles[0];
    if (!p) {
      target.innerHTML = empty('Novos aprendizados vêm aí.', state.filter || Object.values(state.filters).some(Boolean) ? `Nenhum monitor disponível para “${state.filter || 'os filtros selecionados'}” agora. Tente outra disciplina ou atualize a busca.` : 'Ainda não há monitores por aqui. Que tal oferecer ajuda em uma disciplina que você conhece?', state.filter || Object.values(state.filters).some(Boolean) ? 'clear-search' : 'profile', state.filter || Object.values(state.filters).some(Boolean) ? 'Limpar busca e filtros' : 'Oferecer monitoria', 'explore') + '<button class="text-btn full" data-action="refresh">Atualizar e rever perfis pulados</button>';
      return;
    }
    const photo = safePhoto(p.photo_url);
    const subjects = Array.isArray(p.subjects) ? p.subjects : [];
    target.innerHTML = `${state.filter ? `<p class="filter-summary">Buscando ${esc(state.filter)}</p>` : ''}<article class="mentor-card" aria-label="Monitor: ${esc(p.name)}"><div class="portrait">${photo ? `<img decoding="async" src="${esc(photo)}" alt="Foto de ${esc(p.name)}" draggable="false">` : ''}<div class="card-top"><span class="badge">${icon('cap')}Monitoria</span><span class="badge">${esc(formatName(p.format))}</span></div><div class="portrait-space" aria-hidden="true"><span class="portrait-initials" ${photo ? 'hidden' : ''}>${esc(initials(p.name))}</span></div><div class="card-info"><div class="card-identity"><h2>${esc(p.name)}</h2><button class="icon-btn card-detail" data-action="detail" aria-label="Ver perfil" title="Ver perfil">${icon('user')}</button></div><p>${esc(p.course)} · ${esc(p.semester)}º semestre</p><div class="card-subjects"><span class="card-subject-label">Ajuda com</span>${chips(subjects.slice(0, 2))}${subjects.length > 2 ? `<button class="text-btn" data-action="detail" aria-label="Ver mais ${subjects.length - 2} disciplinas no perfil">+${subjects.length - 2}</button>` : ''}</div></div></div></article><div class="card-actions"><div class="deck-action"><button class="skip" data-action="skip" aria-label="Pular monitor ${esc(p.name)}" title="Pular monitor">${icon('close')}</button><span aria-hidden="true">Pular</span></div><div class="deck-action">${window.MentorProduct.favoriteButton(p)}<span aria-hidden="true">Favorito</span></div><div class="deck-action"><button class="btn primary" data-action="request" aria-label="Solicitar monitoria" title="Solicitar monitoria">${icon('check')}</button><span aria-hidden="true">Solicitar</span></div></div><details class="card-compatibility"><summary>Por que este perfil?</summary>${window.MentorProduct.reasonMarkup(p, state.profile)}</details><p class="gesture-hint">← Pular · Solicitar →<br>Perfis pulados voltam ao atualizar.</p>`;
    const card = $('.mentor-card'); let drag = null, suppressed = false;
    const sizeCard = () => {
      if (!card.isConnected) return;
      const clearance = card.getBoundingClientRect().top + window.scrollY + $('.bottom-nav').getBoundingClientRect().height + $('.card-actions').getBoundingClientRect().height + 24;
      card.style.setProperty('--card-clearance', `${Math.ceil(clearance)}px`);
    };
    const image = $('img', card);
    if (image) image.addEventListener('error', () => { image.hidden = true; $('.portrait-initials', card).hidden = false; }, { once: true });
    sizeCard();
    state.cardLayout = new ResizeObserver(sizeCard);
    for (const node of document.querySelectorAll('.topbar, .pwa-tools, .discovery-heading, .discovery .search, .bottom-nav, .card-actions')) state.cardLayout.observe(node);
    card.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      drag = { x: event.clientX, y: event.clientY, id: event.pointerId, dx: 0, dy: 0 };
    });
    card.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.dx = event.clientX - drag.x; drag.dy = event.clientY - drag.y;
      if (Math.abs(drag.dx) > 12 && Math.abs(drag.dx) > Math.abs(drag.dy) * 1.3) {
        if (!card.hasPointerCapture(event.pointerId)) card.setPointerCapture(event.pointerId);
        card.style.transform = `translateX(${Math.max(-70, Math.min(70, drag.dx * .4))}px) rotate(${drag.dx / 45}deg)`;
        let stamp = $('.swipe-stamp', card); if (!stamp) { stamp = document.createElement('span'); stamp.className = 'swipe-stamp'; card.append(stamp); }
        stamp.textContent = drag.dx > 0 ? 'SOLICITAR' : 'PULAR';
      }
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const gesture = drag; drag = null; card.style.transform = ''; $('.swipe-stamp', card)?.remove();
      if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
      if (event.type === 'pointercancel') return;
      if (Math.abs(gesture.dx) >= 65 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3) {
        suppressed = true; if (gesture.dx > 0) requestDialog(p); else skip();
        setTimeout(() => { suppressed = false; }, 300);
      }
    };
    card.addEventListener('pointerup', finish); card.addEventListener('pointercancel', finish);
    card.addEventListener('click', event => { if (!suppressed && !event.target.closest('button')) detailDialog(p.id); });
  }
  function skip() { if (!state.profiles.length) return; state.profiles.shift(); renderCard(); toast('Perfil pulado. Ele pode voltar ao atualizar.'); }
  function closeDialog() { const dialog = $('#mentorDialog'); if (dialog) { dialog.close(); dialog.remove(); } }
  function dialog(title, body) {
    closeDialog(); const node = document.createElement('dialog'); node.id = 'mentorDialog'; node.className = 'dialog';
    node.setAttribute('aria-labelledby', 'dialogTitle');
    node.innerHTML = `<div class="dialog-header"><h2 id="dialogTitle">${esc(title)}</h2><button class="icon-btn" id="closeDialog" aria-label="Fechar janela">${icon('close')}</button></div>${body}`;
    app.append(node); $('#closeDialog').onclick = closeDialog;
    node.addEventListener('click', event => { if (event.target === node) { const r = node.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
    node.addEventListener('cancel', () => node.remove()); node.showModal(); return node;
  }
  async function detailDialog(id) {
    const epoch = state.epoch, node = dialog('Perfil acadêmico', loading());
    try {
      const p = await rpc('mentor_profile', { p_user: id });
      if (!active(epoch) || !node.isConnected) return;
      if (!p) throw failure('Este perfil não está mais disponível. Atualize sua lista.');
      const photo = safePhoto(p.photo_url);
      $('#dialogTitle').textContent = p.name;
      $('.loading', node).outerHTML = `${photo ? `<img decoding="async" class="detail-photo" src="${esc(photo)}" alt="Foto de ${esc(p.name)}">` : ''}<p><strong>${esc(p.course)}</strong> · ${esc(p.semester)}º semestre</p>${p.institution ? `<p>${esc(p.institution)}</p>` : ''}${p.city ? `<p class="muted">${esc(p.city)}</p>` : ''}<div class="detail-item"><small>Sobre</small><p>${esc(p.bio || 'Ainda não adicionou uma apresentação.')}</p></div><div class="detail-item"><small>Pode ajudar com</small>${chips(p.subjects)}</div><div class="detail-item"><small>Quer aprender</small>${chips(p.learning_subjects)}</div><div class="detail-item"><small>Matérias atuais</small>${chips(p.current_subjects)}</div><div class="detail-item"><small>Assuntos de interesse</small>${chips(p.topics)}</div><div class="detail-item"><small>Preferência de estudo</small><p>${esc(studyPreference(p.study_preference))}</p></div><div class="detail-item"><small>Disponibilidade · ${esc(formatName(p.format))}</small><p>${esc(p.availability || 'A combinar na conversa')}</p></div>${window.MentorProduct.reasonMarkup(p, state.profile)}${window.MentorProduct.detailMarkup(p)}<section id="academicPeerReviews" aria-label="Feedback recebido"></section><div class="dialog-actions">${p.active && ['explore', 'home', 'favorites'].includes(state.view) ? '<button id="detailRequest" class="btn primary">Solicitar monitoria</button>' : ''}${window.MentorProduct.favoriteButton(p)}<button id="detailReport" class="text-btn">Denunciar estudante</button><button id="detailBlock" class="text-btn">Bloquear estudante</button></div>`;
      $('#detailRequest')?.addEventListener('click', () => requestDialog(p)); $('#detailBlock').onclick = () => blockDialog(p); $('#detailReport').onclick = () => window.MentorProduct.reportDialog(p); mountReviews($('#academicPeerReviews'), p.id);
    } catch (error) { if (active(epoch) && node.isConnected) $('.loading', node).outerHTML = `<div class="notice error" role="alert">${esc(friendly(error))}</div><button id="detailRetry" class="btn secondary">Tentar novamente</button>`; $('#detailRetry')?.addEventListener('click', () => detailDialog(id)); }
  }
  function requestDialog(p) {
    if (!p || !state.profile) return;
    const epoch = state.epoch;
    const node = dialog('Vamos aprender juntos?', `<p>Envie uma solicitação para <strong>${esc(p.name)}</strong>. A conversa só é liberada se o pedido for aceito.</p><div id="requestNotice"></div><form id="requestForm" class="stack"><div class="field"><label for="requestSubject">Em qual disciplina?</label><select id="requestSubject" required><option value="">Selecione uma disciplina</option>${(p.subjects || []).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></div>${window.MentorProduct.requestFields()}<button class="btn primary" type="submit">Confirmar solicitação</button></form>`);
    $('#requestForm').onsubmit = async event => {
      event.preventDefault(); const subject = $('#requestSubject').value, key = `request:${p.id}:${subject}`;
      if (state.pending.has(key) || !p.subjects.includes(subject)) return;
      state.pending.add(key); const button = event.currentTarget.querySelector('button'); button.disabled = true;
      try {
        const guidance = window.MentorProduct.guided(event.currentTarget);
        await rpc('mentor_request_product', { p_mentor: p.id, p_subject: subject, ...guidance }, { mutation: true });
        if (!active(epoch)) return;
        if (node.isConnected) closeDialog(); toast('Solicitação enviada. Aguarde a resposta do monitor.'); state.direction = 'outgoing'; navigate('requests');
      } catch (error) { if (active(epoch) && node.isConnected) notice($('#requestNotice'), friendly(error)); }
      finally { state.pending.delete(key); button.disabled = false; }
    };
  }
  async function requestView() {
    const epoch = state.epoch, chats = state.view === 'chats';
    main.innerHTML = `<div class="intro"><p class="eyebrow">${chats ? 'A troca começa aqui' : 'Conhecimento em movimento'}</p><div class="row between"><h1>${chats ? 'Boas conversas.<br>Novas descobertas.' : 'Um pedido.<br>Muitas possibilidades.'}</h1><button class="icon-btn" data-action="refresh" aria-label="Atualizar ${chats ? 'conversas' : 'solicitações'}">${icon('refresh')}</button></div><p>${chats ? 'Pedidos aceitos viram espaço para aprender.' : 'Acompanhe quem quer aprender com você — e com quem você quer aprender.'}</p></div>${chats ? '<div class="row section-title"><button class="btn soft" data-action="requests">Solicitações</button><button class="btn secondary" data-action="groups">Grupos de estudo</button></div>' : '<div id="requestFilters"></div>'}<div id="listNotice"></div><div id="requestList">${loading(chats ? 'Buscando conversas…' : 'Buscando solicitações…', 'list')}</div>`;
    try {
      const requests = await rpc('mentor_requests');
      if (!active(epoch)) return;
      state.requests = requests || []; renderRequests(); startPolling();
    } catch (error) { if (active(epoch)) { notice($('#listNotice'), friendly(error)); $('#requestList').innerHTML = '<button class="btn primary full" data-action="refresh">Tentar novamente</button>'; } }
  }
  function renderRequests() {
    const chats = state.view === 'chats';
    if (!$('#requestList') || state.chat) return;
    if (!chats) $('#requestFilters').innerHTML = `<div class="segmented" aria-label="Filtrar solicitações"><button data-direction="incoming" aria-pressed="${state.direction === 'incoming'}">Recebidas (${state.requests.filter(r => r.direction === 'incoming').length})</button><button data-direction="outgoing" aria-pressed="${state.direction === 'outgoing'}">Enviadas (${state.requests.filter(r => r.direction === 'outgoing').length})</button></div>`;
    const items = state.requests.filter(r => r.peer && (chats ? r.status === 'accepted' : r.direction === state.direction));
    if (!items.length) {
      $('#requestList').innerHTML = empty(chats ? 'A conversa vem depois do sim.' : state.direction === 'incoming' ? 'Seu conhecimento pode ajudar.' : 'Qual é a sua próxima descoberta?', chats ? 'Quando uma solicitação for aceita, a conversa aparece aqui. Encontre alguém para aprender com você.' : state.direction === 'incoming' ? 'Nenhuma solicitação recebida. Mantenha seu perfil atualizado e disponível para oferecer monitoria.' : 'Você ainda não enviou solicitações. Explore os monitores e escolha uma disciplina.', !chats && state.direction === 'incoming' ? 'profile' : 'explore', !chats && state.direction === 'incoming' ? 'Editar disponibilidade' : 'Explorar monitores', chats ? 'chat' : 'request');
      return;
    }
    $('#requestList').innerHTML = `<div class="list">${items.map(r => `<article class="list-card"><div class="row"><span class="avatar-mini" aria-hidden="true">${esc(initials(r.peer.name))}</span><button class="peer-button" data-peer="${esc(r.peer.id)}" aria-label="Ver perfil de ${esc(r.peer.name)}"><h3>${esc(r.peer.name)}</h3><small>${esc(r.peer.course)}</small></button>${chats ? icon('chat') : `<span class="status ${r.status === 'accepted' ? 'accepted' : r.status === 'declined' ? 'declined' : ''}">${esc(statusName(r.status))}</span>`}</div><p class="subject">${esc(r.subject)}</p>${window.MentorProduct.requestSummary(r)}${r.status === 'accepted' ? '<p class="muted">Deu match! Vocês podem estudar juntos.</p>' : ''}<div class="row between"><small>${r.direction === 'incoming' ? 'Você oferece apoio' : 'Você quer aprender'}</small>${r.status === 'accepted' ? `<button class="btn soft" data-chat="${esc(r.id)}">Conversar ${icon('arrow')}</button>` : r.status === 'pending' && r.direction === 'incoming' ? `<div class="row"><button class="btn secondary" data-response="decline" data-id="${esc(r.id)}" ${state.pending.has(`respond:${r.id}`) ? 'disabled' : ''}>Recusar</button><button class="btn primary" data-response="accept" data-id="${esc(r.id)}" ${state.pending.has(`respond:${r.id}`) ? 'disabled' : ''}>Aceitar</button></div>` : ''}</div></article>`).join('')}</div>`;
  }
  async function respond(id, accept) {
    const key = `respond:${id}`; if (state.pending.has(key)) return;
    const epoch = state.epoch; state.pending.add(key); renderRequests();
    try {
      const result = await rpc('mentor_respond', { p_request: id, p_accept: accept }, { mutation: true });
      if (!active(epoch)) return;
      state.revision++;
      const request = state.requests.find(r => r.id === id); if (request) Object.assign(request, result);
      toast(accept ? 'Solicitação aceita. A conversa está disponível.' : 'Solicitação recusada.');
      if (accept && request) matchDialog(request);
    } catch (error) { if (active(epoch)) notice($('#listNotice'), friendly(error)); }
    finally { state.pending.delete(key); if (active(epoch)) renderRequests(); }
  }
  function startPolling() {
    clearInterval(state.poll); state.poll = null;
    if (document.hidden || !state.user || !state.profile || !['requests', 'chats'].includes(state.view)) return;
    state.poll = setInterval(pollCurrent, 12000);
  }
  async function pollCurrent() {
    if (document.hidden || state.loading || state.pending.size) return;
    const epoch = state.epoch, revision = state.revision; state.loading = true;
    try {
      if (state.chat && !state.chatDenied) {
        const messages = await rpc('mentor_messages', { p_request: state.chat.id });
        if (!active(epoch) || document.hidden || revision !== state.revision || state.pending.size) return;
        state.messages = messages || []; renderMessages(); $('#chatNotice').innerHTML = '';
      } else if (!state.chat) {
        const requests = await rpc('mentor_requests');
        if (!active(epoch) || document.hidden || revision !== state.revision || state.pending.size) return;
        state.requests = requests || []; renderRequests(); $('#listNotice').innerHTML = '';
      }
    } catch (error) {
      if (!active(epoch) || document.hidden) return;
      if (state.chat) chatError(error); else notice($('#listNotice'), `${friendly(error)} A lista abaixo pode estar desatualizada.`);
    } finally { state.loading = false; }
  }
  function matchDialog(request) {
    dialog('Deu match!', `<section class="match-panel"><div class="match-mark">${icon('book')}</div><h2>Vocês podem estudar juntos.</h2><p>Você e ${esc(request.peer.name)} demonstraram interesse em compartilhar conhecimento em <strong>${esc(request.subject)}</strong>.</p><button class="btn primary full" id="startMatchedChat">Começar conversa ${icon('chat')}</button></section>`);
    $('#startMatchedChat').onclick = () => { closeDialog(); openChat(request.id); };
  }
  async function openChat(id) {
    let request = state.requests.find(r => r.id === id && r.status === 'accepted');
    if (!request) {
      const epoch = state.epoch;
      try { const requests = await rpc('mentor_requests'); if (!active(epoch)) return; state.requests = requests || []; request = state.requests.find(r => r.id === id && r.status === 'accepted'); }
      catch (error) { if (active(epoch)) toast(friendly(error)); return; }
    }
    if (!request?.peer) { toast('Esta conversa não está disponível. A solicitação precisa estar aceita.'); return; }
    const epoch = invalidate(); state.view = 'chats'; state.chat = request; state.messages = []; state.chatDenied = false; nav();
    main.innerHTML = `<div class="row chat-heading"><button class="icon-btn" data-nav="chats" aria-label="Voltar às conversas">${icon('back')}</button><div class="grow"><h1>${esc(request.peer.name)}</h1><p>${esc(request.subject)}</p></div><button class="icon-btn" id="chatBlock" aria-label="Bloquear estudante">${icon('shield')}</button><button class="icon-btn" id="chatRefresh" aria-label="Atualizar mensagens">${icon('refresh')}</button></div><div class="product-actions"><button class="text-btn" id="chatReport">Denunciar estudante</button></div>${window.MentorProduct.requestSummary(request)}<div id="chatNotice"></div><div id="messages" class="messages" role="log" aria-label="Mensagens da monitoria" aria-live="polite">${loading('Abrindo sua conversa…', 'messages')}</div><div id="composerRoot"></div><section id="academicChatTools" aria-label="Materiais e encontros"></section>`;
    $('#chatBlock').onclick = () => blockDialog(request.peer); $('#chatReport').onclick = () => window.MentorProduct.reportDialog(request.peer); $('#chatRefresh').onclick = () => openChat(id);
    try {
      const messages = await rpc('mentor_messages', { p_request: id });
      if (!active(epoch)) return;
      state.messages = messages || []; renderMessages(); renderComposer(); startPolling();
      const tools = $('#academicChatTools');
      if (window.MentorAcademic?.mountChatTools) Promise.resolve().then(() => active(epoch) && window.MentorAcademic.mountChatTools(tools, { requestId: id, peer: request.peer, subject: request.subject })).catch(error => { if (active(epoch) && tools.isConnected) notice(tools, friendly(error)); });
    } catch (error) { if (active(epoch)) chatError(error); }
  }
  function renderMessages() {
    const container = $('#messages'); if (!container || state.chatDenied) return;
    const bottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
    const markup = state.messages.length ? state.messages.map(m => {
      const own = m.sender_id === state.user.id, date = new Date(m.created_at), valid = Number.isFinite(+date);
      return `<div class="bubble ${own ? 'own' : ''}"><small>${esc(own ? 'Você' : state.chat.peer.name)}</small>${esc(m.body)}<time ${valid ? `datetime="${esc(date.toISOString())}"` : ''}>${esc(valid ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')}</time></div>`;
    }).join('') : '<p class="muted">Um “olá” é um ótimo começo. Combine como vocês preferem estudar.</p>';
    if (container.innerHTML !== markup) { container.innerHTML = markup; if (bottom && state.messages.length) container.lastElementChild?.scrollIntoView({ block: 'nearest' }); }
  }
  function renderComposer() {
    if (state.chatDenied || !state.chat) return;
    const id = state.chat.id;
    $('#composerRoot').innerHTML = `<form id="messageForm" class="composer"><label class="sr-only" for="messageBody">Sua mensagem</label><textarea id="messageBody" rows="1" maxlength="2000" placeholder="Compartilhe sua dúvida…" required ${state.pending.has(`send:${id}`) ? 'disabled' : ''}>${esc(state.drafts.get(id) || '')}</textarea><button class="btn primary" type="submit" aria-label="Enviar mensagem" ${state.pending.has(`send:${id}`) ? 'disabled' : ''}>${icon('send')}</button></form><small>Converse com respeito. Não envie senhas ou informações sensíveis.</small>`;
    $('#messageBody').oninput = event => {
      state.drafts.set(id, event.target.value);
      const pending = state.outbox.get(id); if (pending && pending.body !== event.target.value.trim()) state.outbox.delete(id);
    };
    $('#messageForm').onsubmit = sendMessage;
  }
  function chatError(error) {
    if (isDenied(error)) {
      state.chatDenied = true; state.messages = []; clearInterval(state.poll); state.poll = null;
      if ($('#messages')) $('#messages').innerHTML = '';
      if ($('#composerRoot')) $('#composerRoot').innerHTML = '';
      if ($('#academicChatTools')) $('#academicChatTools').innerHTML = '';
      window.MentorAcademic?.cleanup?.();
      notice($('#chatNotice'), 'Esta conversa não está mais disponível. O pedido pode ter mudado ou o acesso pode ter sido bloqueado. Volte à lista de conversas.');
    } else { if ($('#messages .loading')) $('#messages').innerHTML = ''; notice($('#chatNotice'), friendly(error)); }
  }
  async function sendMessage(event) {
    event.preventDefault(); const request = state.chat;
    if (!request || state.chatDenied || state.pending.has(`send:${request.id}`)) return;
    const textarea = $('#messageBody'), body = textarea.value.trim(); if (!body) return;
    const epoch = state.epoch, key = `send:${request.id}`;
    state.drafts.set(request.id, textarea.value);
    let payload = state.outbox.get(request.id);
    if (!payload || payload.body !== body) { payload = { body, id: crypto.randomUUID() }; state.outbox.set(request.id, payload); }
    state.pending.add(key); textarea.disabled = true; $('#messageForm button').disabled = true;
    try {
      const message = await rpc('mentor_send', { p_request: request.id, p_body: payload.body, p_client_id: payload.id }, { mutation: true });
      if (!active(epoch)) return;
      state.revision++; state.drafts.delete(request.id); state.outbox.delete(request.id);
      if (!state.messages.some(m => m.id === message.id)) state.messages.push(message);
      $('#chatNotice').innerHTML = ''; renderMessages();
    } catch (error) { if (active(epoch)) chatError(error); }
    finally { state.pending.delete(key); if (state.chat?.id === request.id && !state.chatDenied) renderComposer(); }
  }
  function laboratoryDialog() {
    if (!state.user || !state.profile) return;
    const user = state.user.id, key = `lab-reset:${user}`;
    const node = dialog('Laboratório · Resetar matches', `<p>Recomece os testes sem recriar sua conta. Aqui, matches são suas conexões acadêmicas.</p><div class="notice error"><strong>Esta ação é irreversível e afeta os dois participantes.</strong><p>Apaga todos os seus pedidos enviados e recebidos (pendentes, aceitos e recusados), conversas, encontros individuais, avaliações desses encontros e referências aos materiais dessas conexões.</p></div><p>Preserva sua conta, perfil, foto, matérias, favoritos, bloqueios, denúncias e todos os grupos. Conexões entre outras pessoas não são alteradas.</p><p>Arquivos já baixados e eventos exportados ao calendário não são apagados. Links temporários podem funcionar até expirar. Os arquivos no Storage não são excluídos fisicamente por este reset.</p><div id="labNotice"></div><form id="labResetForm" class="stack"><div class="field"><label for="labConfirmation">Digite RESETAR para confirmar</label><input id="labConfirmation" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" required pattern="RESETAR" aria-describedby="labResetHint"><small id="labResetHint">Use apenas em contas de laboratório, com ciência das pessoas envolvidas.</small></div><button class="btn danger full" type="submit" disabled>Resetar meus matches</button><button class="btn secondary full" type="button" id="cancelLabReset">Cancelar</button></form>`);
    const form = $('#labResetForm', node), input = $('#labConfirmation', node), button = form.querySelector('[type="submit"]');
    const update = () => { button.disabled = input.value !== 'RESETAR' || state.pending.has(key); };
    input.oninput = update; $('#cancelLabReset', node).onclick = closeDialog;
    if (state.pending.has(key)) notice($('#labNotice', node), 'Um reset já está em andamento. Aguarde a resposta.', false);
    form.onsubmit = async event => {
      event.preventDefault();
      if (state.user?.id !== user || input.value !== 'RESETAR' || state.pending.has(key)) return;
      state.pending.add(key); update(); input.disabled = true;
      notice($('#labNotice', node), 'Resetando suas conexões… Fechar esta janela não cancela a operação.', false);
      try {
        const result = await rpc('mentor_reset_connections', { p_confirmation: input.value }, { mutation: true });
        if (!result || result.reset !== true || !Number.isInteger(result.requests) || result.requests < 0) throw failure('O servidor não confirmou o reset. Atualize suas conexões antes de tentar novamente.');
        if (state.user?.id !== user) return;
        state.revision++; state.requests = []; state.profiles = []; state.messages = []; state.chat = null;
        state.drafts.clear(); state.outbox.clear();
        state.homeMetrics = { completedSessions: null, averageRating: null, reviewCount: 0, unreadNotifications: 0 };
        navigate(state.view, false);
        toast(result.requests ? 'Matches resetados. Você já pode enviar novos pedidos.' : 'Nenhum match para resetar. Sua conta foi preservada.');
      } catch (error) {
        if (state.user?.id !== user) return;
        const text = ['PGRST202', '42883'].includes(error?.code) ? 'O reset de laboratório ainda não foi habilitado no servidor. Peça ao responsável para aplicar a atualização.' : `${friendly(error)} Se a resposta foi interrompida, o reset pode ter sido concluído. Atualize suas conexões antes de repetir o reset.`;
        if (node.isConnected) notice($('#labNotice', node), text); else toast(text);
      } finally { state.pending.delete(key); input.disabled = false; update(); }
    };
  }
  function blockDialog(peer) {
    const epoch = state.epoch;
    const node = dialog('Bloquear estudante?', `<p><strong>${esc(peer.name)}</strong> deixará de aparecer para você. As solicitações e conversas entre vocês ficarão indisponíveis. Este bloqueio não envia uma denúncia para uma equipe de moderação.</p><div id="blockNotice"></div><form id="blockForm" class="stack"><div class="field"><label for="blockReason">Motivo (opcional)</label><textarea id="blockReason" maxlength="500" placeholder="Descreva apenas o necessário."></textarea><small>O motivo não é exibido à outra pessoa. Não há opção de desfazer no aplicativo.</small></div><button class="btn danger" type="submit">Confirmar bloqueio</button></form>`);
    $('#blockForm').onsubmit = async event => {
      event.preventDefault(); const key = `block:${peer.id}`; if (state.pending.has(key)) return;
      state.pending.add(key); const button = event.currentTarget.querySelector('button'); button.disabled = true;
      try {
        const result = await rpc('mentor_block', { p_user: peer.id, p_reason: $('#blockReason').value.trim() }, { mutation: true });
        if (!result) throw failure('Não foi possível confirmar o bloqueio. Tente novamente.');
        if (!active(epoch)) return;
        for (const r of state.requests.filter(r => r.peer?.id === peer.id)) { state.drafts.delete(r.id); state.outbox.delete(r.id); }
        state.requests = state.requests.filter(r => r.peer?.id !== peer.id); state.messages = []; closeDialog();
        toast('Estudante bloqueado. O acesso entre vocês foi encerrado.'); navigate(state.view);
      } catch (error) { if (active(epoch) && node.isConnected) notice($('#blockNotice'), friendly(error)); }
      finally { state.pending.delete(key); button.disabled = false; }
    };
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.auth) { if (state.pending.has('auth')) return; state.authTab = target.dataset.auth; invalidate(); authView(); }
    if (target.dataset.nav) navigate(target.dataset.nav);
    if (target.dataset.direction) { state.direction = target.dataset.direction; renderRequests(); }
    if (target.dataset.peer) detailDialog(target.dataset.peer);
    if (target.dataset.chat) openChat(target.dataset.chat);
    if (target.dataset.subjectSearch) { state.filter = target.dataset.subjectSearch; navigate('explore'); }
    if (target.dataset.subjectDetail) subjectDetail(target.dataset.subjectDetail);
    if (target.dataset.response) respond(target.dataset.id, target.dataset.response === 'accept');
    switch (target.dataset.action) {
      case 'home': navigate('home'); break;
      case 'subjects': subjectArea(); break;
      case 'requests': navigate('requests'); break;
      case 'groups': navigate('groups'); break;
      case 'notifications': navigate('notifications'); break;
      case 'privacy': dialog('Sua privacidade', '<p>Seu perfil acadêmico contém apenas o que você informa aqui. Nome, foto opcional, curso, instituição, cidade, matérias e disponibilidade podem ser vistos por estudantes autorizados. Não publique endereço, documentos ou dados sensíveis.</p><p>Desmarque sua disponibilidade no perfil para sair da descoberta. Conversas existentes podem continuar acessíveis. Para interromper o contato com alguém, use Bloquear estudante na conversa ou no perfil da pessoa.</p>'); break;
      case 'security': securityDialog(); break;
      case 'laboratory': laboratoryDialog(); break;
      case 'safety': window.MentorProduct.safetyDialog(); break;
      case 'profile': navigate('profile'); break;
      case 'explore': navigate('explore'); break;
      case 'refresh': navigate(state.view, false); break;
      case 'clear-search': state.filter = ''; state.filters = {}; navigate('explore', false); break;
      case 'skip': skip(); break;
      case 'detail': if (state.profiles[0]) detailDialog(state.profiles[0].id); break;
      case 'request': requestDialog(state.profiles[0]); break;
      case 'logout': logout(); break;
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(state.poll); state.poll = null; }
    else { startPolling(); if (['requests', 'chats'].includes(state.view) && state.profile) pollCurrent(); }
  });
  function connectionNotice() {
    $('.offline')?.remove();
    if (!navigator.onLine) $('.topbar').insertAdjacentHTML('afterend', '<div class="offline" role="status">Você está sem conexão. Seus rascunhos ficam aqui enquanto o aplicativo estiver aberto.</div>');
  }
  window.addEventListener('offline', connectionNotice); window.addEventListener('online', connectionNotice);
  async function init() {
    try {
      if (!window.supabase?.createClient) throw failure('Não foi possível carregar o acesso à conta. Reabra o aplicativo ou tente novamente.');
      client = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') { recoveryFromURL = true; queueMicrotask(() => sessionChanged(session, true)); }
        else if (event === 'SIGNED_OUT') queueMicrotask(() => sessionChanged(null));
        else if (event === 'SIGNED_IN') queueMicrotask(() => sessionChanged(session));
      });
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      await sessionChanged(result.data?.session); connectionNotice();
      if (!result.data?.session && /(?:[?#&])error(?:_code)?=/.test(location.href)) {
        notice($('#authNotice'), 'Este link de acesso expirou ou não é válido. Solicite um novo link em “Esqueci minha senha”.');
        history.replaceState(null, '', location.pathname);
      }
    } catch (error) { errorView(error, init); }
  }
  window.MentorApp = {
    get client() { return client; }, get user() { return state.user; }, get profile() { return state.profile; },
    get epoch() { return state.epoch; }, get view() { return state.view; }, isCurrent: active, loadCatalog,
    navigate, refreshHome: () => navigate('home', false), openChat, openRequestChat: openChat, openGroup: id => navigate('groups', true, { groupId: id }), updateHomeMetrics,
    updateFavorite: (id, saved) => { for (const profile of state.profiles) if (profile.id === id) profile.is_favorite = saved; },
    helpers: { esc, icon, toast, notice, rpc, dialog, closeDialog, friendly, safePhoto, loading, empty },
    get container() { return main; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
