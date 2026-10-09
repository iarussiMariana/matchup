/* Shared identity and navigation; domain data stays in its own mode. */
let modeGeneration = 0;
const MODE_LABELS = {dating: 'Relacionamentos', study: 'Estudos', ride: 'Caronas'};
let headerOrigin = null;
let campusHeading = null;
const datingDestinations = ['discover', 'likes', 'matches', 'lines', 'profile'];

function sparkIcon(name) {
  const paths = {
    'arrow-left': '<path d="m12 5-7 7 7 7M5 12h14"/>',
    'arrow-right': '<path d="m12 5 7 7-7 7M19 12H5"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    book: '<path d="M12 5v15M12 5Q7 2 3 4v15q4-2 9 1 5-3 9-1V4q-4-2-9 1Z"/>',
    car: '<path d="m4 10 2-6h12l2 6M3 10h18v9H3zM6 19v2M18 19v2M6 14h2M16 14h2"/>',
    heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15S25 10 20 5Z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 6"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/>',
    send: '<path d="m3 3 18 9-18 9 4-9ZM7 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m4 12 5 5L20 6"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    bell: '<path d="M5 16h14l-2-3V8a5 5 0 0 0-10 0v5ZM9 20h6"/>',
    swap: '<path d="M4 7h16l-4-4M20 17H4l4 4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    star: '<path d="m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'
  };
  return `<svg class="spark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.info}</svg>`;
}
window.sparkIcon = sparkIcon;

function setCampusHeading(title, backCallback = null) {
  campusHeading = {title, backCallback};
  updateModeShell();
}
window.setCampusHeading = setCampusHeading;

function restoreHeader() {
  if (!headerOrigin) return;
  headerOrigin.replaceChildren(...$('#modeContext').childNodes);
  headerOrigin.classList.remove('shell-adopted');
  headerOrigin = null;
}

function setupDialogPresentation() {
  const managed = new Set(['matchedProfileModal', 'profilePhotoModal', 'resetActivityModal']);
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    if (managed.has(modal.id)) return;
    const title = modal.querySelector('h2');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (title) {
      title.id ||= `${modal.id}Title`;
      modal.setAttribute('aria-labelledby', title.id);
    }
    modal.tabIndex = -1;
    let open = false, opener = null;
    const controls = () => [...modal.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]')]
      .filter(node => !node.disabled && node.getClientRects().length);
    new MutationObserver(() => {
      const visible = modal.classList.contains('show');
      if (visible === open) return;
      open = visible;
      if (visible) {
        opener = document.activeElement;
        (controls()[0] || modal).focus();
      } else if (!document.querySelector('.modal-backdrop.show') && opener?.isConnected) opener.focus();
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!modal.querySelector('button:disabled')) modal.classList.remove('show');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const items = controls();
        const current = items.indexOf(document.activeElement);
        (items[(current + (event.shiftKey ? -1 : 1) + items.length) % items.length] || modal).focus();
      }
    });
  });
}

function setupModeShell() {
  setupDialogPresentation();
  window.CampusModes.init();
  $('#switchMode').innerHTML = sparkIcon('swap');
  $('#switchMode').onclick = showModeHub;
  new ResizeObserver(() => {
    $('#app').style.setProperty('--shell-header-height', `${$('#modeBar').getBoundingClientRect().height}px`);
  }).observe($('#modeBar'), { box: 'border-box' });
  const icons = {btnNotif:['bell','Notificações'], btnFilter:['settings','Filtros'], goSettings:['settings','Configurações'], backFromEdit:['arrow-left','Voltar ao perfil'], backFromSettings:['arrow-left','Voltar ao perfil'], saveProfile:['check','Salvar perfil'], clearNotifsBtn:['trash','Limpar notificações'], closeChatBtn:['arrow-left','Voltar às conversas'], chatMenuBtn:['more','Opções da conversa'], sendBtn:['send','Enviar mensagem'], btnRewind:['refresh','Voltar'], btnNope:['close','Recusar'], btnLike:['heart','Curtir'], btnSuper:['star','Supercurtir'], btnBoost:['star','Destaque']};
  Object.entries(icons).forEach(([id,[icon,label]]) => {
    const button = $('#' + id);
    if (!button) return;
    const badge = button.querySelector('.badge');
    button.innerHTML = sparkIcon(icon);
    if (badge) button.append(badge);
    button.setAttribute('aria-label', label);
  });
  $$('.topbar .btn-icon:not([aria-label])').forEach(button => {
    const back = button.textContent.trim() === '←';
    const icon = back ? 'arrow-left' : button.textContent.includes('🔍') ? 'search' : button.textContent.includes('⭐') ? 'star' : 'info';
    button.setAttribute('aria-label', back ? 'Voltar' : icon === 'search' ? 'Buscar conversas' : icon === 'star' ? 'Cantadas favoritas' : 'Informações');
    button.innerHTML = sparkIcon(icon);
  });
  const navIcons = {discover:'compass',likes:'heart',matches:'users',lines:'chat',profile:'user'};
  $$('#datingNav .nav-item').forEach(button => { button.querySelector('.icon').innerHTML = sparkIcon(navIcons[button.dataset.screen]); });
  $$('[data-campus-mode]').forEach(button => {
    button.onclick = () => selectCampusMode(button.dataset.campusMode);
  });
  $('#campusLogout').onclick = resetarEstado;
  $('#campusTerms').onclick = showTerms;
  $('#campusIdentityForm').onsubmit = async event => {
    event.preventDefault();
    await runAuth(event.currentTarget, async () => {
      const name = $('#campusAccountName').value.trim();
      if (name.length < 2 || name.length > 80) throw new Error('Use um nome de 2 a 80 caracteres.');
      const {error} = await sparkClient.from('profiles').update({name}).eq('id', state.userId);
      if (error) throw error;
      state.user.nome = name;
      showToast('Nome atualizado nos três modos.', 'success');
    });
  };
}

function updateModeShell() {
  restoreHeader();
  const visible = !!state.userId && state.currentScreen !== 'auth';
  const app = $('#app');
  app.dataset.mode = state.mode || 'dating';
  document.body.dataset.mode = state.mode || 'dating';
  $('#modeBar').classList.toggle('hidden', !visible);
  app.classList.toggle('has-mode-bar', visible);
  $('#activeModeLabel').textContent = MODE_LABELS[state.mode] || 'Spark Campus';
  $('#modeHeading').classList.remove('hidden');
  $('#modeBack').classList.add('hidden');
  $('#switchMode').setAttribute('aria-label', state.currentScreen === 'modes' ? 'Início' : 'Trocar modo');
  $('#switchMode').title = state.currentScreen === 'modes' ? 'Início' : 'Trocar modo';
  const chatOpen = state.currentScreen === 'chats' && $('#chatRoom').classList.contains('open');
  if (visible && state.mode === 'dating') {
    const screen = $('.screen.active');
    const source = chatOpen ? $('.chat-room-header') : screen?.querySelector(':scope > .topbar');
    if (source) {
      headerOrigin = source;
      const brand = source.querySelector('.brand');
      if (state.currentScreen === 'discover' && brand) brand.textContent = MODE_LABELS.dating;
      $('#modeContext').replaceChildren(...source.childNodes);
      source.classList.add('shell-adopted');
      $('#modeHeading').classList.add('hidden');
    } else if (state.currentScreen === 'onboarding') $('#activeModeLabel').textContent = 'Seu perfil';
    const nav = $('#datingNav');
    const showNav = datingDestinations.includes(state.currentScreen);
    nav.classList.toggle('hidden', !showNav);
    if (showNav) screen.append(nav);
    updateNavActive(state.currentScreen);
  } else {
    $('#datingNav').classList.add('hidden');
    if (state.currentScreen === 'campus' && campusHeading) {
      $('#activeModeLabel').textContent = campusHeading.title;
      if (campusHeading.backCallback) {
        $('#modeBack').classList.remove('hidden');
        $('#modeBack').innerHTML = sparkIcon('arrow-left');
        $('#modeBack').onclick = campusHeading.backCallback;
      }
    }
  }
  $('#modeBar').classList.toggle('chat-heading', chatOpen);
  app.style.setProperty('--shell-header-height', `${$('#modeBar').getBoundingClientRect().height}px`);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(app).getPropertyValue('--primary').trim();
}

function modeChangeBlocked() {
  return activityResetBusy || soltarCarta.busy || enviarMensagem.busy || salvarPerfil.busy ||
    finalizarOnboarding.busy || editingPhotoUpload || onboardingData.uploading || notificationBusy ||
    $('#campusIdentityForm').dataset.busy;
}

function leaveCurrentMode() {
  modeGeneration++;
  campusHeading = null;
  window.CampusModes.close();
  clearInterval(syncTimer);
  Object.values(state.chatSubscriptions).forEach(channel => sparkClient.removeChannel(channel));
  state.chatSubscriptions = {};
  closeMatchedProfile();
  $('#chatRoom').classList.remove('open');
  state.currentChat = null;
  $$('.modal-backdrop.show').forEach(modal => modal.classList.remove('show'));
}

function showModeHub() {
  if (!state.userId) return;
  if (modeChangeBlocked()) { showToast('Aguarde a operação terminar para trocar de modo.', 'info'); return; }
  leaveCurrentMode();
  state.mode = null;
  try { localStorage.removeItem(`spark_mode_${state.userId}`); } catch { /* Storage can be unavailable. */ }
  $('#campusAccountName').value = state.user.nome || '';
  $('#campusAccountEmail').textContent = state.user.email || '';
  navigate('modes');
}

async function selectCampusMode(mode) {
  if (!state.userId || !MODE_LABELS[mode]) return;
  if (modeChangeBlocked()) { showToast('Aguarde a operação terminar para trocar de modo.', 'info'); return; }
  leaveCurrentMode();
  state.mode = mode;
  try { localStorage.setItem(`spark_mode_${state.userId}`, mode); } catch { /* Optional local preference. */ }
  updateModeShell();
  if (mode !== 'dating') {
    navigate('campus');
    await window.CampusModes.open(mode);
  } else if (state.user.onboardingComplete) {
    const generation = modeGeneration;
    state.discoveryDirty = false;
    await iniciarApp();
    // Keep the mode accessible if loading fails, without reviving a mode left meanwhile.
    if (generation === modeGeneration && state.mode === 'dating') navigate('discover');
  } else {
    navigate('onboarding');
    setupOnboarding();
  }
}

async function enterCampus() {
  let savedMode;
  try { savedMode = localStorage.getItem(`spark_mode_${state.userId}`); } catch { /* Fall back to chooser. */ }
  if (MODE_LABELS[savedMode]) await selectCampusMode(savedMode);
  else showModeHub();
}
