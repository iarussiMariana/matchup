/* =====================================================================
   1. CONFIGURAÇÃO SUPABASE
   ===================================================================== */

const SUPABASE_URL = 'https://drvqiiddgcgvmbbnwdky.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Vis5e7586v8GVIRo3_CVIg_Yd7O21_k';

let sparkClient;

/* =====================================================================
   2. DADOS MOCK (fallback mínimo — Supabase é a fonte principal)
   ===================================================================== */

/**
 * Lista de perfis de pessoas disponíveis para swipe.
 * Carregada via Supabase (profiles table).
 */
const PROFILES = []; // preenchido via Supabase

/**
 * Banco de cantadas divididas por categoria.
 */
const PICKUP_LINES = [
  { cat: 'Campus', text: 'Entre uma aula e outra, cabe um café com você? ☕' },
  { cat: 'Campus', text: 'O trabalho é em grupo, mas o convite pro café é só pra você. 📚' },
  { cat: 'Campus', text: 'Minha agenda tem aula, entrega e um espaço pra te conhecer. 🗓️' },
  { cat: 'Campus', text: 'A gente já deu match. Bora transformar o intervalo em um date? ✨' },
  // Clássicas
  { cat: 'Clássicas', text: 'Você deve ser um bombeiro, porque incendiou meu coração. 🔥' },
  { cat: 'Clássicas', text: 'Perdi meu número de telefone. Posso pegar o seu? 📱' },
  { cat: 'Clássicas', text: 'Você acredita em amor à primeira vista ou devo passar de novo? 👀' },
  { cat: 'Clássicas', text: 'Se você fosse um vegetal, seria uma cenoura, porque me deixa apaixonado. 🥕' },
  { cat: 'Clássicas', text: 'Está com dor? Porque quando te vi, meu coração parou. 💓' },
  { cat: 'Clássicas', text: 'Você tem um mapa? Porque me perdi nos seus olhos. 🗺️' },

  // Engraçadas
  { cat: 'Engraçadas', text: 'Você é filha(o) de padeiro? Porque é um pedaço de mau caminho! 🥐' },
  { cat: 'Engraçadas', text: 'Você trabalha no Correios? Porque acabou de entregar meu coração. 📮' },
  { cat: 'Engraçadas', text: 'Se você fosse um hambúrguer, seria um X-Tudo, porque tem tudo que eu gosto. 🍔' },
  { cat: 'Engraçadas', text: 'Cê tem wi-fi? Porque senti uma conexão. 📶' },
  { cat: 'Engraçadas', text: 'Se apaixonar por você foi tão fácil que até meu GPS se perdeu. 🧭' },
  { cat: 'Engraçadas', text: 'Você é um dicionário? Porque definiu o que é perfeição. 📖' },

  // Geek
  { cat: 'Geek', text: 'Você é feita(o) de cobre e telúrio? Porque é Cu-Te. ⚛️' },
  { cat: 'Geek', text: 'Se você fosse um bug, eu nunca iria querer corrigir. 💻' },
  { cat: 'Geek', text: 'Você é meu commit favorito, sempre volto pra você. 🖥️' },
  { cat: 'Geek', text: 'Você é tipo Wi-Fi forte: impossível resistir à conexão. 📡' },
  { cat: 'Geek', text: 'Se você fosse um jogo, eu jogaria a vida toda sem pause. 🎮' },
  { cat: 'Geek', text: 'Você deve ser um algoritmo, porque me dominou em O(1). 🧮' },

  // Românticas
  { cat: 'Românticas', text: 'Se eu pudesse escolher entre você e o sol, escolheria você: você ilumina meus dias sem queimar. ☀️' },
  { cat: 'Românticas', text: 'Você é a música que eu quero ouvir pelo resto da vida. 🎶' },
  { cat: 'Românticas', text: 'Em um mundo cheio de cópias, você é a única original que eu quero. 🌟' },
  { cat: 'Românticas', text: 'Cada momento sem você é um verso que falta no meu poema. ✍️' },
  { cat: 'Românticas', text: 'Se o amor fosse uma estrela, você seria o meu universo inteiro. 🌌' },

  // Diretas
  { cat: 'Diretas', text: 'Você é lindo(a) e eu queria muito te conhecer melhor. 😏' },
  { cat: 'Diretas', text: 'Não sou de enrolar: bora sair essa semana? 🍸' },
  { cat: 'Diretas', text: 'Olha, você chamou minha atenção. Vamos conversar? 💬' },
  { cat: 'Diretas', text: 'Vou ser direto: quero te levar pra jantar. Topa? 🍽️' },
  { cat: 'Diretas', text: 'Você é o tipo de pessoa que eu apresentaria pra minha mãe. 👩‍🦰' },

  // Nerds
  { cat: 'Nerds', text: 'Você é minha variável favorita, sempre no meu escopo. 📐' },
  { cat: 'Nerds', text: 'Vamos calcular nossa compatibilidade: 100% garantido. 📊' },
  { cat: 'Nerds', text: 'Se você fosse uma equação, seria meu teorema favorito. 🧠' },
  { cat: 'Nerds', text: 'Você é a prova de que a beleza também pode ser inteligente. 🎓' },

  // Café / Bares
  { cat: 'Date', text: 'Bora tomar um café? Eu pago a primeira rodada. ☕' },
  { cat: 'Date', text: 'Conheço um barzinho escondido que você vai amar. Topa? 🍻' },
  { cat: 'Date', text: 'Que tal um cinema seguido de pizza? Clássico e infalível. 🍕' },
  { cat: 'Date', text: 'Vamos fazer uma trilha no fim de semana? Levo os snacks. 🥾' },
  { cat: 'Date', text: 'Sabe aquele restaurante que eu sempre quis ir? Você é a companhia perfeita. 🍝' },

  // Fofas
  { cat: 'Fofas', text: 'Você sorri assim sempre ou é só pra me conquistar? 😊' },
  { cat: 'Fofas', text: 'Aposto que você é a pessoa que faz todo mundo rir. Quero conhecer. 🥰' },
  { cat: 'Fofas', text: 'Você parece ser aquele tipo de pessoa que a gente quer abraçar. 🤗' },
  { cat: 'Fofas', text: 'Sua energia é contagiante, quero mais disso na minha vida. ✨' },
];

/**
 * Stickers e interesses disponíveis.
 * Carregados do Supabase ou usados como fallback.
 */
let STICKERS = ['😍','🔥','💕','😘','🥰','😜','🤗','😎','✨','💋','❤️','💖','🌟','🎉','😇','🤩','😊','🙌','💪','🌹'];
let INTERESTS = ['Música','Fotografia','Viagem','Café','Fitness','Leitura','Filmes','Games','Arte','Culinária','Tecnologia','Moda','Esportes','Yoga','Dança','Natureza','Animais','Praia','Trilha','Vinho','Vida no campus','Café no intervalo','Atlética','Projetos e UPX','Grupo de estudos','Rolê pós-aula'];

/* =====================================================================
   3. ESTADO GLOBAL
   ===================================================================== */

/**
 * Estado central da aplicação. Todos os dados persistentes e transitórios
 * ficam aqui.
 */
const state = {
  userId: null,             // Supabase auth user ID
  user: {
    nome: '',
    idade: 25,
    genero: 'Prefiro não dizer',
    interessadoEm: 'Todos',
    cidade: 'São Paulo, SP',
    bio: '',
    interesses: [],
    fotos: [],
    email: '',
    emoji: '🦄',
    verificado: true,
    isPremium: false,
    criadoEm: null,
  },
  deck: [],
  swipedIds: [],
  matches: [],
  chats: {},
  unread: {},
  notifications: [],
  favoriteLines: [],
  filters: {
    distancia: 50,
    idadeMin: 18,
    idadeMax: 45,
    genero: 'Todos',
    apenasVerificados: false,
  },
  prefs: {
    distancia: 50,
    idadeMin: 18,
    idadeMax: 45,
  },
  settings: {
    location: true,
    global: false,
    notifMsg: true,
    notifLike: true,
  },
  currentChat: null,
  lastSwiped: null,
  currentLineCategory: 'Todas',
  currentScreen: 'discover',
  previousScreen: null,
  premiumPlan: 'month',
  blockList: [],
  chatSubscriptions: {},   // Map<matchId, supabaseChannel> for cleanup
  drag: {
    ativo: false,
    card: null,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
  },
};

/* =====================================================================
   4. UTILITÁRIOS
   ===================================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function photoUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === SUPABASE_URL && url.pathname.startsWith('/storage/v1/object/public/photos/') ? url.href : '';
  } catch { return ''; }
}

function avatarHtml(value) {
  const url = photoUrl(value);
  return url ? `<img class="avatar-image" src="${escapeHtml(url)}" alt="Foto do perfil" loading="lazy">` : escapeHtml(String(value || '🦄').slice(0, 8));
}

function setAvatar(element, value) { element.innerHTML = avatarHtml(value); }
function safeColor(value) { return /^#[a-f\d]{6}$/i.test(value || '') ? value : '#A855F7'; }
function mapMessage(msg) {
  return {id: msg.id, texto: msg.content, tipo: msg.sender_id === state.userId ? 'sent' : 'received',
    hora: new Date(msg.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
    timestamp: new Date(msg.created_at).getTime()};
}

async function markChatRead(perfil) {
  const { error } = await sparkClient.from('messages').update({read:true})
    .eq('match_id', perfil.matchId).neq('sender_id', state.userId).eq('read', false);
  if (!error) { state.unread[perfil.id] = 0; atualizarTodosBadges(); }
}

async function runAuth(form, action) {
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    if (!sparkClient) throw new Error('Conexão indisponível. Reabra o aplicativo e tente novamente.');
    await action();
  } catch (err) { showToast(err.message || 'Não foi possível conectar. Tente novamente.', 'error'); }
  finally { delete form.dataset.busy; button.disabled = false; }
}

/**
 * Exibe um toast por um curto período.
 * @param {string} msg
 * @param {string} type - info|success|error|warn
 */
function showToast(msg, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 320);
  }, 2600);
}

/**
 * Formata hora atual em HH:MM.
 */
function horaAtual() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0');
}

/**
 * Calcula idade a partir de data.
 */
function calcularIdade(dataStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr || '')) return NaN;
  const [year, month, day] = dataStr.split('-').map(Number);
  const nasc = new Date(year, month - 1, day);
  if (nasc.getFullYear() !== year || nasc.getMonth() !== month - 1 || nasc.getDate() !== day) return NaN;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

/**
 * Formata tempo relativo de "agora".
 */
function tempoRelativo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const horas = Math.floor(mins / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias}d`;
}

/**
 * Gera cor de gradiente aleatório.
 */
function corAleatoria() {
  const cores = [
    ['#A855F7', '#EC4899'], ['#3B82F6', '#8B5CF6'], ['#10B981', '#06B6D4'],
    ['#F59E0B', '#EF4444'], ['#EC4899', '#F59E0B'], ['#7C3AED', '#4F46E5'],
    ['#059669', '#10B981'], ['#EA580C', '#F59E0B'], ['#DB2777', '#7C3AED'],
    ['#1E40AF', '#0EA5E9'], ['#E11D48', '#BE185D'], ['#0EA5E9', '#1E40AF'],
  ];
  return cores[Math.floor(Math.random() * cores.length)];
}

/**
 * Embaralha array (Fisher–Yates).
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Persiste estado no localStorage (mínimo — sessão é gerenciada pelo Supabase).
 */
function salvarEstado() {
  if (!state.userId) return;
  try {
    localStorage.setItem(`spark_preferences_${state.userId}`, JSON.stringify({
      filters: state.filters,
      prefs: state.prefs,
      settings: state.settings,
      currentLineCategory: state.currentLineCategory,
      favoriteLines: state.favoriteLines,
    }));
  } catch (e) {
    console.warn('Falha ao salvar estado', e);
  }
}

function carregarPreferencias() {
  try {
    const parsed = JSON.parse(localStorage.getItem(`spark_preferences_${state.userId}`) || '{}');
    if (parsed.filters) Object.assign(state.filters, parsed.filters);
    if (parsed.prefs) Object.assign(state.prefs, parsed.prefs);
    if (Array.isArray(parsed.favoriteLines)) state.favoriteLines = parsed.favoriteLines;
    if (parsed.currentLineCategory) state.currentLineCategory = parsed.currentLineCategory;
  } catch { /* Ignore corrupted local preferences; account data comes from Supabase. */ }
}

/**
 * Carrega estado do localStorage e restaura sessão via Supabase.
 */
async function carregarEstado() {
  try {
    if (!sparkClient) return false;
    const { data: { session }, error } = await sparkClient.auth.getSession();
    if (error || !session) return false;

    const userId = session.user.id;
    state.userId = userId;
    state.user.email = session.user.email;

    // Busca perfil do usuário no Supabase
    const { data: profile, error: profileError } = await sparkClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;
    if (!profile) return false;

    state.user.birthDate = profile.birth_date;
    state.user.onboardingComplete = !!profile.onboarding_complete;
    state.user.nome = profile.name || '';
    state.user.idade = profile.age || calcularIdade(profile.birth_date);
    state.user.genero = profile.gender || 'Prefiro não dizer';
    state.user.interessadoEm = profile.looking_for || 'Todos';
    state.user.cidade = profile.city || 'São Paulo, SP';
    state.user.bio = profile.bio || '';
    state.user.interesses = profile.interests || [];
    state.user.fotos = profile.photos || [];
    state.user.emoji = profile.avatar || '🦄';
    state.user.verificado = profile.verified || false;
    state.user.isPremium = profile.is_premium || false;

    carregarPreferencias();

    return true;
  } catch (e) {
    showToast('Não foi possível restaurar a sessão. Entre novamente ou tente reabrir com internet.', 'error');
    return false;
  }
}

/**
 * Reseta estado (logout).
 */
async function resetarEstado() {
  // Cleanup chat subscriptions
  Object.values(state.chatSubscriptions).forEach(ch => {
    sparkClient.removeChannel(ch);
  });
  state.chatSubscriptions = {};

  const {error} = await sparkClient.auth.signOut({scope:'local'});
  if (error) { showToast('Não foi possível sair. Tente novamente.', 'error'); return; }
  clearInterval(syncTimer);
  localStorage.removeItem('spark_session');
  location.reload();
}

/* =====================================================================
   5. NAVEGAÇÃO
   ===================================================================== */

/**
 * Navega para uma tela específica.
 * @param {string} screenName
 */
function navigate(screenName) {
  const screens = {
    'auth': 'screen-auth',
    'modes': 'screen-modes',
    'campus': 'screen-campus',
    'onboarding': 'screen-onboarding',
    'discover': 'screen-discover',
    'likes': 'screen-likes',
    'matches': 'screen-matches',
    'chats': 'screen-chats',
    'lines': 'screen-lines',
    'profile': 'screen-profile',
    'edit-profile': 'screen-edit-profile',
    'settings': 'screen-settings',
    'notifications': 'screen-notifications',
  };

  const targetId = screens[screenName];
  if (!targetId) {
    console.warn('Tela desconhecida:', screenName);
    return;
  }

  if (!['auth', 'modes', 'campus'].includes(screenName) && state.mode !== 'dating') return;
  if (screenName === 'discover' && state.discoveryDirty) { iniciarApp(); return; }
  state.previousScreen = state.currentScreen;
  state.currentScreen = screenName;

  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#' + targetId).classList.add('active');
  updateModeShell();

  // Atualizações ao entrar em telas específicas
  if (screenName === 'discover') {
    renderDeck();
    updateNavActive('discover');
  } else if (screenName === 'likes') {
    renderLikes();
  } else if (screenName === 'matches') {
    renderMatches();
  } else if (screenName === 'chats') {
    renderChatList();
  } else if (screenName === 'lines') {
    renderLines();
  } else if (screenName === 'profile') {
    renderProfile();
  } else if (screenName === 'edit-profile') {
    loadEditProfile();
  } else if (screenName === 'notifications') {
    renderNotifications();
  }

  salvarEstado();
}

/**
 * Atualiza item ativo do bottom nav.
 */
function updateNavActive(screen) {
  $$('#datingNav .nav-item').forEach(item => {
    const active = item.dataset.screen === screen;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

/**
 * Configura os cliques do bottom nav.
 */
function setupBottomNav() {
  $$('#datingNav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const screen = item.dataset.screen;
      if (screen === 'matches') navigate('matches');
      else if (screen === 'chats') navigate('chats');
      else navigate(screen);
    });
  });
}

/* =====================================================================
   6. AUTENTICAÇÃO
   ===================================================================== */

function showInfo(title, text) {
  $('#infoTitle').textContent = title;
  $('#infoText').textContent = text;
  $('#infoModal').classList.add('show');
}

function showTerms() {
  showInfo('Uso e privacidade — MVP acadêmico', 'Spark Campus é um projeto acadêmico de UPX para adultos (18+), sem vínculo oficial ou garantia da FACENS. Uma conta dá acesso a Relacionamentos, Estudos e Caronas. Use apenas fotos próprias, respeite as pessoas e não compartilhe dados sensíveis.\n\nOs dados são armazenados no Supabase e exigem internet, não um notebook ligado. Nome e anúncios de grupos/viagens são visíveis aos participantes do campus. Listas de membros e conversas de grupos/viagens ficam restritas aos integrantes. Não publique endereço residencial: combine pontos públicos. Caronas não têm pagamento, GPS, verificação de motorista ou garantia de segurança. Confirme motorista, veículo e trajeto antes de embarcar.\n\nO perfil romântico só é publicado após concluir o cadastro de Relacionamentos e é visível a quem também concluiu esse cadastro. Trocar de modo não desativa esse perfil. Fotos usam links públicos: nunca envie conteúdo privado. Conversas de matches, grupos e viagens são separadas, sem criptografia de ponta a ponta.\n\nDenúncias no modo Relacionamentos são analisadas manualmente e bloqueiam o contato; não há atendimento de emergência nem moderação contínua. Para problemas em grupos/caronas, suporte ou exclusão de dados, contate a responsável que forneceu o APK. Não há cobrança ou assinatura neste MVP.');
}

function openRecovery() {
  $('#recoveryEmail').value = $('#loginEmail').value || state.user.email || '';
  $('#recoveryModal').classList.add('show');
}

let verifiedRecoveryLink = null;
function setupRecovery() {
  $('#recoveryRequestForm').onsubmit = async e => {
    e.preventDefault();
    await runAuth(e.currentTarget, async () => {
      const { error } = await sparkClient.auth.resetPasswordForEmail($('#recoveryEmail').value.trim());
      if (error) throw error;
      $('#recoveryNotice').textContent = 'Se este e-mail estiver cadastrado, você receberá as instruções. Confira o spam e copie o link do botão de recuperação abaixo.';
    });
  };
  $('#recoveryApplyForm').onsubmit = async e => {
    e.preventDefault();
    await runAuth(e.currentTarget, async () => {
      const url = new URL($('#recoveryLink').value.trim());
      const hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
      if (url.origin !== SUPABASE_URL || url.pathname !== '/auth/v1/verify' || url.searchParams.get('type') !== 'recovery' || !hash) {
        throw new Error('Copie o endereço original do botão de recuperação enviado pelo Spark.');
      }
      if (verifiedRecoveryLink !== url.href) {
        const { error: verifyError } = await sparkClient.auth.verifyOtp({ token_hash: hash, type: 'recovery' });
        if (verifyError) throw verifyError;
        verifiedRecoveryLink = url.href;
      }
      const { error } = await sparkClient.auth.updateUser({password: $('#recoveryPassword').value});
      if (error) throw error;
      const {error: signOutError} = await sparkClient.auth.signOut({scope:'local'});
      if (signOutError) throw new Error('Senha atualizada, mas não foi possível sair. Tente novamente.');
      verifiedRecoveryLink = null;
      $('#recoveryApplyForm').reset();
      $('#recoveryModal').classList.remove('show');
      $('#authNotice').textContent = 'Senha atualizada. Entre com a nova senha.';
      state.userId = null;
      navigate('auth');
    });
  };
}

function setupAuth() {
  // Tabs
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      if (target === 'login') {
        $('#loginForm').classList.remove('hidden');
        $('#registerForm').classList.add('hidden');
      } else {
        $('#loginForm').classList.add('hidden');
        $('#registerForm').classList.remove('hidden');
      }
    });
  });

  // Login
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await runAuth(e.currentTarget, async () => {
    const email = $('#loginEmail').value.trim();
    const pass = $('#loginPass').value;

    if (!email || !pass) {
      showToast('Preencha todos os campos', 'error');
      return;
    }

    try {
      const { data, error } = await sparkClient.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;

      const userId = data.user.id;
      state.userId = userId;
      state.user.email = data.user.email;

      // Busca perfil
      const { data: profile, error: profileError } = await sparkClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      if (profile) {
        state.user.birthDate = profile.birth_date;
        state.user.onboardingComplete = !!profile.onboarding_complete;
        state.user.nome = profile.name || '';
        state.user.idade = profile.age || calcularIdade(profile.birth_date);
        state.user.genero = profile.gender || 'Prefiro não dizer';
        state.user.interessadoEm = profile.looking_for || 'Todos';
        state.user.cidade = profile.city || 'São Paulo, SP';
        state.user.bio = profile.bio || '';
        state.user.interesses = profile.interests || [];
        state.user.fotos = profile.photos || [];
        state.user.emoji = profile.avatar || '🦄';
        state.user.verificado = profile.verified || false;
        state.user.isPremium = profile.is_premium || false;
        state.user.criadoEm = Date.now();
      }

      carregarPreferencias();
      showToast('Bem-vindo(a) de volta! 💖', 'success');

      await enterCampus();
    } catch (err) {
      showToast(err.message || 'Erro ao fazer login', 'error');
    }
    });
  });

  // Registro
  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await runAuth(e.currentTarget, async () => {
    const nome = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const birth = $('#regBirth').value;
    const pass = $('#regPass').value;

    if (!nome || !email || !birth || !pass) {
      showToast('Preencha todos os campos', 'error');
      return;
    }

    const idade = calcularIdade(birth);
    if (!Number.isFinite(idade) || idade < 18 || idade > 120) {
      showToast('Você precisa ter 18 anos ou mais', 'error');
      return;
    }

    try {
      const { data, error } = await sparkClient.auth.signUp({
        email,
        password: pass,
        options: {
          data: {
            name: nome,
            birth_date: birth,
          },
        },
      });
      if (error) throw error;

      if (!data.session) {
        $('#loginEmail').value = email;
        $('[data-tab="login"]').click();
        $('#registerForm').reset();
        $('#authNotice').textContent = 'Cadastro recebido! Confirme seu e-mail (verifique também o spam) e depois entre com sua senha. Se já tiver conta, tente entrar ou recuperar a senha.';
        return;
      }
      const userId = data.user.id;
      state.userId = userId;
      state.user.birthDate = birth;
      state.user.nome = nome;
      state.user.email = email;
      state.user.idade = idade;
      state.user.criadoEm = Date.now();

      state.user.onboardingComplete = false;
      showToast('Conta criada com sucesso! 🎉', 'success');
      showModeHub();
    } catch (err) {
      showToast(err.message || 'Erro ao criar conta', 'error');
    }
    });
  });
}

/**
 * Inicializa o app após login/onboarding completo.
 */
async function iniciarApp() {
  const generation = modeGeneration;
  try {
    if (!state.userId || state.mode !== 'dating') return;

    // Busca IDs já swipados
    const { data: swipes, error: swipeError } = await sparkClient
      .from('swipes')
      .select('swiped_id')
      .eq('swiper_id', state.userId);

    if (generation !== modeGeneration || state.mode !== 'dating') return;
    if (swipeError) throw swipeError;
    state.swipedIds = swipes ? swipes.map(s => s.swiped_id) : [];

    // Busca perfis para descobrir (excluindo usuário e já swipados)
    let query = sparkClient
      .from('profiles')
      .select('*')
      .neq('id', state.userId);

    // Aplica filtros se houver
    if (state.filters.genero !== 'Todos') {
      query = query.eq('gender', state.filters.genero);
    }
    query = query.eq('onboarding_complete', true);
    if (state.filters.apenasVerificados) query = query.eq('verified', true);
    if (state.filters.idadeMin) {
      query = query.gte('age', state.filters.idadeMin);
    }
    if (state.filters.idadeMax) {
      query = query.lte('age', state.filters.idadeMax);
    }

    const { data: profiles, error } = await query;
    if (generation !== modeGeneration) return;
    if (error) throw error;

    // Filtra os já swipados e mapeia para o formato esperado
    const swipedSet = new Set(state.swipedIds);
    state.deck = (profiles || [])
      .filter(p => !swipedSet.has(p.id))
      .map(p => ({
        id: p.id,
        nome: p.name,
        idade: p.age,
        genero: p.gender,
        cidade: p.city || 'São Paulo, SP',
        bio: p.bio || '',
        interesses: p.interests || [],
        avatar: p.avatar || '🦄',
        cor1: p.color1 || '#A855F7',
        cor2: p.color2 || '#EC4899',
        profissao: p.profession || '',
        signo: p.sign || '',
        distancia: p.distance ?? null,
        online: p.online || false,
        verificado: p.verified || false,
        fotos: p.photos || [],
      }));
  } catch (err) {
    if (generation !== modeGeneration || state.mode !== 'dating') return;
    showToast('Não foi possível carregar os perfis. Verifique a conexão e tente atualizar.', 'error');
    return;
  }

  // Carrega matches
  try {
    await carregarMatches();
  } catch (err) {
    console.warn('Falha ao carregar matches:', err);
  }

  if (generation !== modeGeneration || state.mode !== 'dating') return;
  state.discoveryDirty = false;
  navigate('discover');
  startRealtime();
  refreshActivity();
  atualizarTodosBadges();
  renderProfileStats();
}

/**
 * Carrega matches e mensagens do Supabase.
 */
let syncTimer;
let syncBusy = false;
let syncAgain = false;
async function refreshActivity() {
  if (!state.userId || state.mode !== 'dating' || !state.user.onboardingComplete || document.hidden || activityResetBusy) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  const generation = modeGeneration;
  try {
    const previousMatchIds = state.matches.map(match => match.matchId);
    await carregarMatches();
    if (generation !== modeGeneration || state.mode !== 'dating') return;
    if (previousMatchIds.some(id => !state.matches.some(match => match.matchId === id))) state.discoveryDirty = true;
    const {data, error} = await sparkClient.from('notifications').select('*').eq('user_id', state.userId).order('created_at', {ascending:false}).limit(50);
    if (error) throw error;
    if (generation !== modeGeneration || state.mode !== 'dating') return;
    state.notifications = data || [];
    if (state.currentChat) {
      const match = state.matches.find(m => m.id === state.currentChat);
      if (!match) fecharChat();
      else { renderMensagens(); await markChatRead(match); }
    }
    if (state.currentScreen === 'matches') renderMatches();
    if (state.currentScreen === 'chats') renderChatList();
    if (state.currentScreen === 'notifications') displayNotifications();
    if (matchedProfileId && !state.matches.some(m => m.id === matchedProfileId)) {
      ++matchedProfileRequest;
      unavailableMatchedProfile('Este match não está mais disponível. Ele pode ter sido desfeito, resetado ou bloqueado.');
    }
    atualizarTodosBadges();
  } catch { /* The next realtime event or foreground poll retries without claiming success. */ }
  finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; refreshActivity(); }
  }
}

function startRealtime() {
  if (state.chatSubscriptions.activity) return;
  const channel = sparkClient.channel(`activity-${state.userId}`);
  for (const table of ['messages', 'matches', 'notifications']) {
    channel.on('postgres_changes', {event:'*', schema:'public', table}, refreshActivity);
  }
  state.chatSubscriptions.activity = channel.subscribe(status => {
    if (status === 'SUBSCRIBED') refreshActivity();
  });
  clearInterval(syncTimer);
  syncTimer = setInterval(refreshActivity, 15000);
}

async function carregarMatches() {
  if (!state.userId) return;

  const { data: matches, error } = await sparkClient
    .from('matches')
    .select('*, user1:profiles!matches_user1_id_fkey(*), user2:profiles!matches_user2_id_fkey(*)')
    .eq('active', true)
    .or(`user1_id.eq.${state.userId},user2_id.eq.${state.userId}`);

  if (error) throw error;
  if (!matches) return;

  const nextMatches = [], nextChats = {}, nextUnread = {};

  for (const m of matches) {
    const otherUser = m.user1_id === state.userId ? m.user2 : m.user1;
    if (!otherUser) continue;

    const matchProfile = {
      id: otherUser.id,
      matchId: m.id,
      nome: otherUser.name,
      idade: otherUser.age,
      avatar: otherUser.photos?.[0] || otherUser.avatar || '🦄',
      cor1: otherUser.color1 || '#A855F7',
      cor2: otherUser.color2 || '#EC4899',
      online: otherUser.online || false,
      verificado: otherUser.verified || false,
      profissao: otherUser.profession || '',
      distancia: otherUser.distance ?? null,
      interesses: otherUser.interests || [],
      fotos: otherUser.photos || [],
      bio: otherUser.bio || '',
      cidade: otherUser.city || '',
      genero: otherUser.gender || '',
      signo: otherUser.sign || '',
    };

    nextMatches.push(matchProfile);

    // Carrega mensagens
    const { data: msgs, error: messagesError } = await sparkClient
      .from('messages')
      .select('*')
      .eq('match_id', m.id)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;
    nextChats[otherUser.id] = (msgs || []).map(mapMessage);

    nextUnread[otherUser.id] = (msgs || []).filter(
      msg => msg.sender_id !== state.userId && !msg.read
    ).length;
  }
  state.matches = nextMatches;
  state.chats = nextChats;
  state.unread = nextUnread;

}

/* =====================================================================
   7. ONBOARDING
   ===================================================================== */

const onboardingData = {
  name: '',
  gender: '',
  looking: '',
  birth: '',
  photos: [],
  bio: '',
  interests: [],
  step: 0,
};

function setupOnboarding() {
  if (setupOnboarding.ready) return;
  setupOnboarding.ready = true;
  onboardingData.step = 0;

  // Preenche nome se já tiver
  if (state.user.nome) {
    $('#onbName').value = state.user.nome;
    onboardingData.name = state.user.nome;
  }

  // Preenche data de nascimento
  if (state.user.birthDate) $('#onbBirth').value = state.user.birthDate;

  // Interesses
  renderOnbInterests();

  // Fotos - configura grid
  setupPhotoGrid();

  // Bio counter
  const bioInput = $('#onbBio');
  bioInput.addEventListener('input', () => {
    $('#onbBioCount').textContent = bioInput.value.length;
  });

  // Options cards
  document.querySelectorAll('.onb-step .option-card').forEach(card => {
    card.addEventListener('click', () => {
      const step = card.closest('.onb-step').dataset.step;
      // Desmarca os do mesmo passo
      card.closest('.option-grid').querySelectorAll('.option-card').forEach(c => {
        c.classList.remove('selected');
      });
      card.classList.add('selected');
    });
  });

  atualizarStep();

  // Botões
  $('#onbNext').addEventListener('click', proximoStep);
  $('#onbBack').addEventListener('click', stepAnterior);
}

function renderOnbInterests() {
  const container = $('#onbInterests');
  container.innerHTML = INTERESTS.map(i => `<div class="chip" data-value="${i}">${i}</div>`).join('');

  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      const value = chip.dataset.value;
      const idx = onboardingData.interests.indexOf(value);
      if (idx === -1) onboardingData.interests.push(value);
      else onboardingData.interests.splice(idx, 1);
    });
  });
}

async function uploadPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Use uma imagem JPG, PNG, WebP ou GIF.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Cada foto deve ter no máximo 5 MB.');
  if (!state.userId) throw new Error('Entre na sua conta antes de enviar fotos.');
  const path = `${state.userId}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
  const {error} = await sparkClient.storage.from('photos').upload(path, file, {cacheControl:'3600', upsert:false});
  if (error) throw error;
  return sparkClient.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

let editPhotos = [];
let editingPhotoUpload = false;
function renderEditPhotos() {
  const grid = $('#editPhotos');
  grid.innerHTML = editPhotos.map((url,i) => `<button type="button" class="photo-slot filled" data-index="${i}" aria-label="Remover foto ${i+1}">${avatarHtml(url)}<span class="remove">×</span></button>`).join('');
  grid.querySelectorAll('button').forEach(button => button.onclick = () => {
    if (editingPhotoUpload || salvarPerfil.busy) return;
    editPhotos.splice(Number(button.dataset.index), 1); renderEditPhotos();
  });
  $('#editPhotoInput').disabled = editingPhotoUpload || editPhotos.length >= 6;
}

async function addEditPhotos(event) {
  if (editingPhotoUpload || salvarPerfil.busy) return;
  editingPhotoUpload = true;
  const input = event.target;
  input.disabled = true;
  try {
    for (const file of Array.from(input.files)) {
      if (editPhotos.length >= 6) break;
      editPhotos.push(await uploadPhoto(file)); renderEditPhotos();
    }
  } catch (error) { showToast(error.message || 'Foto não enviada. Tente novamente.', 'error'); }
  finally { editingPhotoUpload = false; input.value = ''; renderEditPhotos(); }
}

function setupPhotoGrid() {
  const slots = $$('#onbPhotoGrid .photo-slot');

  // Create a hidden file input for real photo uploads
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files);
    if (files.length === 0) return;

    if (onboardingData.uploading) return;
    onboardingData.uploading = true;
    $('#onbNext').disabled = true;
    showToast('Enviando fotos... 📤', 'info');

    for (const file of files) {
      // Find first empty slot
      const emptySlot = Array.from(slots).find(s => !s.classList.contains('filled'));
      if (!emptySlot) break;

      try {
        const photoUrl = await uploadPhoto(file);

        // Fill the slot with the real photo
        emptySlot.innerHTML = '';
        emptySlot.style.backgroundImage = `url(${photoUrl})`;
        emptySlot.style.backgroundSize = 'cover';
        emptySlot.style.backgroundPosition = 'center';
        emptySlot.classList.add('filled');
        onboardingData.photos.push(photoUrl);

        // Add remove button
        addRemoveButton(emptySlot, photoUrl);
      } catch (err) {
        showToast(err.message || 'Não foi possível enviar a foto. Tente novamente.', 'error');
      }
    }
    fileInput.value = '';
    onboardingData.uploading = false;
    $('#onbNext').disabled = false;
  });

  function addRemoveButton(slot, photoRef) {
    // Remove existing remove button if any
    const existing = slot.querySelector('.remove');
    if (existing) existing.remove();

    const removeBtn = document.createElement('div');
    removeBtn.className = 'remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      slot.textContent = '+';
      slot.style.backgroundImage = '';
      slot.classList.remove('filled');
      const idx = onboardingData.photos.indexOf(photoRef);
      if (idx !== -1) onboardingData.photos.splice(idx, 1);
      removeBtn.remove();
    });
    slot.appendChild(removeBtn);
  }

  slots.forEach(slot => {
    slot.addEventListener('click', () => {
      if (slot.classList.contains('filled') || onboardingData.uploading) return;
      // On mobile: use file input for real photos
      fileInput.click();
    });


  });
}

function atualizarStep() {
  $$('.onb-step').forEach(s => s.classList.remove('active'));
  const current = document.querySelector(`.onb-step[data-step="${onboardingData.step}"]`);
  if (current) current.classList.add('active');

  const total = $$('.onb-step').length;
  const progress = ((onboardingData.step + 1) / total) * 100;
  $('#onbProgress').style.width = progress + '%';

  // Botão back
  $('#onbBack').classList.toggle('hidden', onboardingData.step === 0);

  // Botão next texto
  if (onboardingData.step === total - 1) {
    $('#onbNext').textContent = 'Começar a explorar 💖';
  } else {
    $('#onbNext').textContent = 'Continuar';
  }
}

function proximoStep() {
  if (onboardingData.uploading) return;
  const step = onboardingData.step;

  // Validações
  if (step === 0) {
    const nome = $('#onbName').value.trim();
    if (!nome) { showToast('Digite seu nome', 'error'); return; }
    onboardingData.name = nome;
  }

  if (step === 1) {
    const sel = document.querySelector('.onb-step[data-step="1"] .option-card.selected');
    if (!sel) { showToast('Escolha uma opção', 'error'); return; }
    onboardingData.gender = sel.dataset.value;
  }

  if (step === 2) {
    const sel = document.querySelector('.onb-step[data-step="2"] .option-card.selected');
    if (!sel) { showToast('Escolha uma opção', 'error'); return; }
    onboardingData.looking = sel.dataset.value;
  }

  if (step === 3) {
    const birth = $('#onbBirth').value;
    if (!birth) { showToast('Informe sua data de nascimento', 'error'); return; }
    const idade = calcularIdade(birth);
    if (!Number.isFinite(idade) || idade < 18 || idade > 120) { showToast('Você precisa ter 18 anos ou mais', 'error'); return; }
    onboardingData.birth = birth;
  }

  if (step === 4) {
    if (onboardingData.photos.length < 1) {
      showToast('Adicione pelo menos 1 foto', 'error');
      return;
    }
  }

  if (step === 5) {
    onboardingData.bio = $('#onbBio').value.trim();
  }

  if (step === 6) {
    if (onboardingData.interests.length < 3) {
      showToast('Escolha pelo menos 3 interesses', 'error');
      return;
    }
  }

  const total = $$('.onb-step').length;
  if (step >= total - 1) {
    finalizarOnboarding();
    return;
  }

  onboardingData.step++;
  atualizarStep();
}

function stepAnterior() {
  if (onboardingData.step > 0) {
    onboardingData.step--;
    atualizarStep();
  }
}

async function finalizarOnboarding() {
  if (onboardingData.uploading) return;
  if (finalizarOnboarding.busy) return;
  finalizarOnboarding.busy = true;
  $('#onbNext').disabled = true;
  const profileData = {
    id: state.userId, name: onboardingData.name, gender: onboardingData.gender,
    looking_for: onboardingData.looking, birth_date: onboardingData.birth,
    city: state.user.cidade, bio: onboardingData.bio, interests: [...onboardingData.interests],
    photos: [...onboardingData.photos], avatar: onboardingData.photos[0] || '🦄',
    color1: '#A855F7', color2: '#EC4899', onboarding_complete: true,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await sparkClient.from('profiles').upsert(profileData);
    if (error) throw error;
    Object.assign(state.user, {nome: profileData.name, genero: profileData.gender,
      interessadoEm: profileData.looking_for, birthDate: profileData.birth_date,
      idade: calcularIdade(profileData.birth_date), fotos: profileData.photos,
      bio: profileData.bio, interesses: profileData.interests, emoji: profileData.avatar,
      onboardingComplete: true});
    salvarEstado();
    showToast('Perfil salvo! 💖', 'success');
    await iniciarApp();
  } catch (err) {
    showToast('Não foi possível salvar o perfil. Seus campos foram mantidos; tente novamente.', 'error');
  } finally {
    finalizarOnboarding.busy = false;
    $('#onbNext').disabled = false;
  }
}

/* =====================================================================
   8. DECK / SWIPE
   ===================================================================== */

function criarCarta(perfil) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.dataset.id = perfil.id;

  const gradient = `linear-gradient(160deg, ${safeColor(perfil.cor1)}, ${safeColor(perfil.cor2)})`;

  // Show first real photo if available, otherwise avatar
  const firstPhoto = perfil.fotos && perfil.fotos.length > 0
    ? perfil.fotos.map(photoUrl).find(Boolean)
    : null;

  const photoStyle = firstPhoto
    ? `background-image:url(&quot;${escapeHtml(firstPhoto)}&quot;);background-size:cover;background-position:center;`
    : `background:${gradient};`;

  const avatarMarkup = firstPhoto
    ? ''
    : `<div class="avatar-big">${avatarHtml(perfil.avatar)}</div>`;

  card.innerHTML = `
    <div class="stamp like">LIKE</div>
    <div class="stamp nope">NOPE</div>
    <div class="stamp super">SUPER</div>

    <div class="card-photo" style="${photoStyle}">
      <div class="overlay"></div>
      ${avatarMarkup}

      <div class="card-top">
        <div>
          ${perfil.online ? '<span class="tag-online">Online</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;">
          ${perfil.verificado ? '<span class="tag-badge">✓ Verificado</span>' : ''}
          <span class="tag-badge">📍 ${perfil.distancia == null ? 'Distância não informada' : escapeHtml(perfil.distancia) + ' km'}</span>
        </div>
      </div>

      <div class="card-info">
        <div class="card-name-row">
          <span class="card-name">${escapeHtml(perfil.nome)}</span>
          <span class="card-age">${escapeHtml(perfil.idade)}</span>
        </div>

        <div class="card-meta">
          <span>${escapeHtml(perfil.cidade)}</span>
          <span class="dot"></span>
          <span>${escapeHtml(perfil.profissao)}</span>
          <span class="dot"></span>
          <span>${escapeHtml(perfil.signo)}</span>
        </div>

        <div class="card-bio">${escapeHtml(perfil.bio)}</div>

        <div class="card-interests">
          ${perfil.interesses.slice(0, 4).map(i => `<span class="interest">${escapeHtml(i)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;

  ativarArrasto(card);
  return card;
}

function renderDeck() {
  const deck = $('#deck');
  deck.innerHTML = '';

  // Aplica filtros
  const filtrados = state.deck.filter(p => aplicarFiltros(p));

  if (filtrados.length === 0) {
    deck.innerHTML = `
      <div class="deck-empty">
        <div class="emoji">💔</div>
        <h3>Nenhum perfil disponível nestes filtros.</h3>
        <p>Intervalo por aqui ☕ Ajuste os filtros ou volte quando houver novos participantes. Para rever recusas, use Configurações → Testes do piloto.</p>
        <button class="btn btn-primary" style="max-width:200px;margin-top:8px;" onclick="resetDeck()">🔄 Atualizar</button>
      </div>
    `;
    return;
  }

  // Renderiza de trás pra frente
  [...filtrados].reverse().forEach(p => deck.appendChild(criarCarta(p)));
  atualizarPilha();
}

function aplicarFiltros(perfil) {
  const f = state.filters;

  if (perfil.distancia > f.distancia) return false;
  if (perfil.idade < f.idadeMin || perfil.idade > f.idadeMax) return false;
  if (f.genero !== 'Todos' && perfil.genero !== f.genero) return false;
  if (f.apenasVerificados && !perfil.verificado) return false;

  // Verifica gênero preferido do usuário
  const looking = state.user.interessadoEm || 'Todos';
  if (looking !== 'Todos') {
    const generoMap = {
      'Homens': 'Homem',
      'Mulheres': 'Mulher',
      'Pessoas não-binárias': 'Não-binário',
    };
    const preferido = generoMap[looking];
    if (preferido && perfil.genero !== preferido) return false;
  }

  return true;
}

function atualizarPilha() {
  const cartas = $$('.profile-card');
  cartas.forEach((c, i) => {
    const fromTop = cartas.length - 1 - i;
    c.style.zIndex = i;
    c.style.transform = `translateY(${fromTop * 8}px) scale(${1 - fromTop * 0.04})`;
    c.style.opacity = fromTop > 2 ? 0 : 1;
    c.style.pointerEvents = fromTop === 0 ? 'auto' : 'none';
  });
}

async function resetDeck() { await iniciarApp(); }

/* =====================================================================
   9. ARRASTO (SWIPE)
   ===================================================================== */

function ativarArrasto(card) {
  const iniciar = (e) => {
    if (card.style.pointerEvents === 'none') return;
    const p = e.touches ? e.touches[0] : e;
    state.drag.ativo = true;
    state.drag.card = card;
    state.drag.startX = p.clientX;
    state.drag.startY = p.clientY;
    state.drag.x = 0;
    state.drag.y = 0;
    card.style.transition = 'none';
  };

  const mover = (e) => {
    if (!state.drag.ativo || state.drag.card !== card) return;
    const p = e.touches ? e.touches[0] : e;
    state.drag.x = p.clientX - state.drag.startX;
    state.drag.y = p.clientY - state.drag.startY;

    const rot = state.drag.x * 0.08;
    card.style.transform = `translate(${state.drag.x}px, ${state.drag.y}px) rotate(${rot}deg)`;

    const like = card.querySelector('.stamp.like');
    const nope = card.querySelector('.stamp.nope');
    const super_ = card.querySelector('.stamp.super');

    if (state.drag.y < -150 && Math.abs(state.drag.x) < 80) {
      super_.style.opacity = Math.min(-state.drag.y / 200, 1);
      like.style.opacity = 0;
      nope.style.opacity = 0;
    } else {
      super_.style.opacity = 0;
      like.style.opacity = Math.min(Math.max(state.drag.x / 110, 0), 1);
      nope.style.opacity = Math.min(Math.max(-state.drag.x / 110, 0), 1);
    }
  };

  const soltar = () => {
    if (!state.drag.ativo || state.drag.card !== card) return;
    state.drag.ativo = false;

    if (state.drag.y < -150 && Math.abs(state.drag.x) < 80) {
      soltarCarta(card, 'super');
    } else if (state.drag.x > 110) {
      soltarCarta(card, 'like');
    } else if (state.drag.x < -110) {
      soltarCarta(card, 'nope');
    } else {
      card.style.transition = 'transform 0.3s ease';
      card.style.transform = '';
      card.querySelectorAll('.stamp').forEach(s => s.style.opacity = 0);
    }
  };

  card.addEventListener('mousedown', iniciar);
  card.addEventListener('touchstart', iniciar, { passive: true });
  document.addEventListener('mousemove', mover);
  document.addEventListener('touchmove', mover, { passive: true });
  document.addEventListener('mouseup', soltar);
  document.addEventListener('touchend', soltar);
}

async function registrarSwipe(perfil, direcao) {
  const { error } = await sparkClient.from('swipes').insert({
    swiper_id: state.userId, swiped_id: perfil.id, direction: direcao,
  });
  if (error && error.code !== '23505') throw error;
  state.swipedIds = [...new Set([...state.swipedIds, perfil.id])];
  state.deck = state.deck.filter(p => p.id !== perfil.id);
  state.lastSwiped = { perfil, direcao };
  if (direcao !== 'nope') {
    const previous = new Set(state.matches.map(m => m.id));
    await carregarMatches();
    const match = state.matches.find(m => m.id === perfil.id);
    if (match && !previous.has(match.id)) criarMatch(match, direcao === 'super');
    else showToast('Curtida salva 💗', 'success');
  }
  salvarEstado();
}

async function soltarCarta(card, direcao) {
  const perfil = state.deck.find(p => p.id === card.dataset.id);
  if (!perfil || soltarCarta.busy) return;
  soltarCarta.busy = true;
  card.style.pointerEvents = 'none';
  try {
    await registrarSwipe(perfil, direcao);
    renderDeck();
  } catch (err) {
    showToast('Não foi possível concluir. Verifique a conexão e tente novamente.', 'error');
    renderDeck();
  } finally { soltarCarta.busy = false; }
}

/* =====================================================================
   10. MATCH
   ===================================================================== */

function criarMatch(perfil, isSuper = false) {
  if (state.mode !== 'dating') return;
  if (!state.matches.find(m => m.id === perfil.id)) state.matches.push(perfil);
  state.chats[perfil.id] ||= [];
  state.unread[perfil.id] ||= 0;

  // Notificação
  state.notifications.unshift({
    id: Date.now(),
    type: 'match',
    title: isSuper ? `⭐ Super Match com ${escapeHtml(perfil.nome)}!` : `💖 Novo match com ${escapeHtml(perfil.nome)}`,
    text: isSuper ? 'Vocês se curtiram com Super Like!' : 'Vocês se curtiram. Mande a primeira mensagem!',
    avatar: perfil.avatar,
    timestamp: Date.now(),
    read: false,
  });

  // Modal
  setAvatar($('#matchTheirAvatar'), perfil.avatar);
  $('#matchTheirAvatar').style.background = `linear-gradient(135deg, ${safeColor(perfil.cor1)}, ${safeColor(perfil.cor2)})`;
  setAvatar($('#matchMyAvatar'), state.user.fotos[0] || state.user.emoji);

  const msg = isSuper
    ? `⭐ Super Match! ${escapeHtml(perfil.nome)} já tinha curtido você antes.`
    : `Você e ${escapeHtml(perfil.nome)} se curtiram! Mande a primeira mensagem.`;
  $('#matchMessage').textContent = msg;

  const modal = $('#matchModal');
  modal.classList.add('show');

  $('#matchSendMsg').onclick = () => {
    modal.classList.remove('show');
    navigate('chats');
    setTimeout(() => abrirChat(perfil.id), 250);
  };

  $('#matchKeepSwiping').onclick = () => {
    modal.classList.remove('show');
  };

  atualizarTodosBadges();
  renderProfileStats();
  salvarEstado();
}

/* =====================================================================
   11. CURTIDAS (LIKES SCREEN)
   ===================================================================== */

async function renderLikes() {
  const grid = $('#likesGrid');
  if (!state.userId) return;
  grid.textContent = 'Carregando curtidas…';
  try {
    const { data, error } = await sparkClient.from('swipes')
      .select('swiper_id, profiles!swipes_swiper_id_fkey(*)')
      .eq('swiped_id', state.userId).in('direction', ['like', 'super']);
    if (error) throw error;
    const profiles = (data || []).filter(s => s.profiles && !state.swipedIds.includes(s.swiper_id))
      .map(s => ({id:s.swiper_id, nome:s.profiles.name, idade:s.profiles.age,
        avatar:s.profiles.photos?.[0] || s.profiles.avatar, cor1:s.profiles.color1, cor2:s.profiles.color2}));
    $('#likesSubtitle').textContent = `${profiles.length} curtidas para responder`;
    grid.innerHTML = profiles.length ? profiles.map(p => `<button class="like-card" data-id="${escapeHtml(p.id)}">
      ${avatarHtml(p.avatar)}<div class="overlay"></div><div class="info"><h4>${escapeHtml(p.nome)}, ${escapeHtml(p.idade)}</h4><p>Toque para curtir de volta</p></div></button>`).join('')
      : '<div class="empty-state"><h3>Nenhuma nova curtida</h3><p>Continue explorando.</p></div>';
    grid.querySelectorAll('.like-card').forEach(card => card.addEventListener('click', async () => {
      if (card.disabled) return;
      card.disabled = true;
      try { await registrarSwipe(profiles.find(p => p.id === card.dataset.id), 'like'); await renderLikes(); }
      catch { showToast('Curtida não concluída. Tente novamente.', 'error'); card.disabled = false; }
    }));
  } catch { grid.textContent = 'Não foi possível carregar curtidas. Volte e tente novamente.'; }
}

/* =====================================================================
   12. MATCHES SCREEN
   ===================================================================== */

function renderMatches() {
  const list = $('#matchesList');

  if (state.matches.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">💘</div>
        <h3>Nenhum match ainda</h3>
        <p>A próxima conversa pode começar com um café no intervalo. Curta alguém e espere a curtida de volta!</p>
        <button class="btn btn-primary" style="max-width:200px;margin-top:12px;" onclick="navigate('discover')">Descobrir pessoas</button>
      </div>
    `;
    return;
  }

  const novos = state.matches.filter(m => (state.chats[m.id] || []).length === 0);
  const comConversa = state.matches.filter(m => (state.chats[m.id] || []).length > 0);

  let html = '';

  if (novos.length > 0) {
    html += `<div class="section-heading">💫 Novos matches (${novos.length})</div>`;
    html += `<div class="new-matches-row">`;
    html += novos.map(m => `
      <div class="new-match-pill" data-id="${m.id}">
        <div class="new-match-ring" style="background:linear-gradient(135deg, ${safeColor(m.cor1)}, ${safeColor(m.cor2)});">
          <div class="inner">${avatarHtml(m.avatar)}</div>
        </div>
        <span>${escapeHtml(m.nome)}</span>
        <button type="button" class="match-profile-link" data-profile="${m.id}">Ver perfil</button>
      </div>
    `).join('');
    html += `</div>`;
  }

  if (comConversa.length > 0) {
    html += `<div class="section-heading">💬 Conversas (${comConversa.length})</div>`;
    html += comConversa.map(m => {
      const msgs = state.chats[m.id] || [];
      const last = msgs[msgs.length - 1];
      const naoLidas = state.unread[m.id] || 0;

      return `
        <div class="match-row" data-id="${m.id}">
          <div class="match-avatar ${m.online ? 'online' : ''}" style="background:linear-gradient(135deg, ${safeColor(m.cor1)}, ${safeColor(m.cor2)});">
            ${avatarHtml(m.avatar)}
          </div>
          <div class="match-info">
            <h4>${escapeHtml(m.nome)} ${m.verificado ? '<span class="verified">✓</span>' : ''}</h4>
            <p class="${naoLidas > 0 ? 'unread' : ''} ${last && last.tipo === 'sent' ? 'sent' : ''}">${escapeHtml(last ? last.texto : 'Novo match!')}</p>
          </div>
          <div class="match-meta">
            ${last ? `<span class="match-time">${last.hora || ''}</span>` : ''}
            ${naoLidas > 0 ? `<span class="badge">${naoLidas}</span>` : ''}
            <button type="button" class="match-profile-link" data-profile="${m.id}">Ver perfil</button>
          </div>
        </div>
      `;
    }).join('');
  }

  list.innerHTML = html;

  list.querySelectorAll('[data-profile]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openMatchedProfile(button.dataset.profile);
    });
  });
  // Click handlers
  list.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      abrirChat(id);
    });
  });
}

/* =====================================================================
   13. CHAT LIST
   ===================================================================== */

function renderChatList() {
  const list = $('#chatListView');
  const search = ($('#chatSearch').value || '').toLowerCase();

  if (state.matches.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">💬</div>
        <h3>Nenhuma conversa ainda</h3>
        <p>Dê match com alguém para começar a conversar!</p>
      </div>
    `;
    return;
  }

  const filtrados = state.matches.filter(m =>
    m.nome.toLowerCase().includes(search)
  );

  if (filtrados.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🔍</div>
        <h3>Nenhum resultado</h3>
        <p>Tente buscar por outro nome</p>
      </div>
    `;
    return;
  }

  // Ordena por última mensagem
  const ordenados = [...filtrados].sort((a, b) => {
    const aMsgs = state.chats[a.id] || [];
    const bMsgs = state.chats[b.id] || [];
    const aT = aMsgs.length ? aMsgs[aMsgs.length - 1].timestamp : 0;
    const bT = bMsgs.length ? bMsgs[bMsgs.length - 1].timestamp : 0;
    return bT - aT;
  });

  list.innerHTML = ordenados.map(m => {
    const msgs = state.chats[m.id] || [];
    const last = msgs[msgs.length - 1];
    const naoLidas = state.unread[m.id] || 0;

    let preview = 'Diga oi para começar 👋';
    if (last) {
      preview = (last.tipo === 'sent' ? 'Você: ' : '') + last.texto;
    }

    return `
      <div class="chat-row" data-id="${m.id}">
        <div class="chat-avatar ${m.online ? 'online' : ''}" style="background:linear-gradient(135deg, ${safeColor(m.cor1)}, ${safeColor(m.cor2)});">
          ${avatarHtml(m.avatar)}
        </div>
        <div class="chat-content">
          <div class="name">${escapeHtml(m.nome)} ${m.verificado ? '<span style="color:var(--blue);font-size:13px;">✓</span>' : ''}</div>
          <div class="preview ${naoLidas > 0 ? 'unread' : ''}">${escapeHtml(preview)}</div>
        </div>
        <div class="chat-side">
          ${last ? `<span class="match-time">${last.hora || ''}</span>` : ''}
          ${naoLidas > 0 ? `<span class="badge">${naoLidas}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.chat-row').forEach(row => {
    row.addEventListener('click', () => abrirChat(row.dataset.id));
  });
}

/* =====================================================================
   14. CHAT ROOM
   ===================================================================== */

function abrirChat(id) {
  if (state.mode !== 'dating') return;
  const perfil = state.matches.find(m => m.id === id);
  if (!perfil) return;

  state.currentChat = id;
  markChatRead(perfil).catch(() => {});

  setAvatar($('#roomAvatar'), perfil.avatar);
  $('#roomAvatar').style.background = `linear-gradient(135deg, ${safeColor(perfil.cor1)}, ${safeColor(perfil.cor2)})`;
  $('#roomAvatar').classList.toggle('online', perfil.online);
  $('#roomName').textContent = perfil.nome;

  const status = $('#roomStatus');
  if (perfil.online) {
    status.textContent = 'online agora';
    status.classList.add('online');
  } else {
    status.textContent = 'Converse com seu match';
    status.classList.remove('online');
  }

  // Garante que a tela de chats está ativa
  if (state.currentScreen !== 'chats') {
    state.previousScreen = state.currentScreen;
    state.currentScreen = 'chats';
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-chats').classList.add('active');
  }

  renderMensagens();
  $('#chatRoom').classList.add('open');
  updateModeShell();
  $('#stickerPicker').classList.add('hidden');
  atualizarTodosBadges();
  salvarEstado();

  setTimeout(() => { if (state.currentChat === id && !$('.modal-backdrop.show')) $('#chatInput').focus(); }, 350);

}

function fecharChat() {
  $('#chatRoom').classList.remove('open');
  const id = state.currentChat;

  state.currentChat = null;
  updateModeShell();
  renderChatList();
  atualizarTodosBadges();
}

function renderMensagens() {
  const body = $('#chatBody');
  const msgs = state.chats[state.currentChat] || [];

  body.innerHTML = `<div class="day-sep">Hoje</div>` +
    msgs.map(m => {
      if (m.tipo === 'sticker') {
        return `<div class="bubble ${m.enviado ? 'sent' : 'received'} sticker">
          <div class="sticker-img">${escapeHtml(m.texto)}</div>
        </div>`;
      }
      return `<div class="bubble ${m.tipo}">
        ${escapeHtml(m.texto)}
        <span class="time">${escapeHtml(m.hora || '')}</span>
      </div>`;
    }).join('');

  // Scroll para o final
  setTimeout(() => {
    body.scrollTop = body.scrollHeight;
  }, 50);
}

async function enviarMensagem(textoOverride) {
  const input = $('#chatInput');
  const texto = (textoOverride || input.value).trim();
  if (!texto || !state.currentChat || enviarMensagem.busy) return;
  if (texto.length > 2000) { showToast('Use até 2.000 caracteres por mensagem.', 'error'); return; }
  const id = state.currentChat;
  const perfil = state.matches.find(m => m.id === id);
  if (!perfil?.matchId) return;
  enviarMensagem.busy = true;
  $('#sendBtn').disabled = true;
  try {
    const { data, error } = await sparkClient.from('messages').insert({
      match_id: perfil.matchId, sender_id: state.userId, content: texto,
    }).select().single();
    if (error) throw error;
    state.chats[id] ||= [];
    if (!state.chats[id].some(m => m.id === data.id)) state.chats[id].push(mapMessage(data));
    if (!textoOverride && input.value.trim() === texto) input.value = '';
    if (state.currentChat === id) renderMensagens();
    renderChatList();
  } catch { showToast('Mensagem não enviada. O texto foi mantido para tentar novamente.', 'error'); }
  finally { enviarMensagem.busy = false; $('#sendBtn').disabled = false; }
}

async function enviarSticker(emoji) {
  $('#stickerPicker').classList.add('hidden');
  await enviarMensagem(emoji);
}

/* =====================================================================
   15. CANTADAS
   ===================================================================== */

function renderLines() {
  const filtersEl = $('#linesFilters');
  const listEl = $('#linesList');

  // Categorias únicas
  const categorias = ['Todas', '⭐ Favoritas', ...new Set(PICKUP_LINES.map(l => l.cat))];

  filtersEl.innerHTML = categorias.map(cat => `
    <div class="filter-chip ${cat === state.currentLineCategory ? 'active' : ''}" data-cat="${cat}">${cat}</div>
  `).join('');

  filtersEl.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.currentLineCategory = chip.dataset.cat;
      renderLines();
    });
  });

  // Filtra linhas
  let linhas = PICKUP_LINES;
  if (state.currentLineCategory === '⭐ Favoritas') {
    linhas = PICKUP_LINES.filter(l => state.favoriteLines.includes(l.text));
  } else if (state.currentLineCategory !== 'Todas') {
    linhas = PICKUP_LINES.filter(l => l.cat === state.currentLineCategory);
  }

  if (linhas.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="emoji">⭐</div>
        <h3>Nenhuma cantada favoritada</h3>
        <p>Toque no ⭐ das cantadas que você mais gostar!</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = linhas.map((l, i) => {
    const isFav = state.favoriteLines.includes(l.text);
    return `
      <div class="line-card" data-index="${i}">
        <span class="line-category">${l.cat}</span>
        <p class="line-text">${l.text}</p>
        <div class="line-actions">
          <button class="copy" data-text="${l.text.replace(/"/g, '&quot;')}">📋 Copiar</button>
          <button class="fav ${isFav ? 'active' : ''}" data-text="${l.text.replace(/"/g, '&quot;')}">
            ${isFav ? '⭐ Favoritada' : '☆ Favoritar'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Handlers
  listEl.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.text;
      navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Cantada copiada!', 'success');
      }).catch(() => {
        showToast('Copie manualmente: ' + text.substring(0, 30) + '...', 'info');
      });
    });
  });

  listEl.querySelectorAll('.fav').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.text;
      const idx = state.favoriteLines.indexOf(text);
      if (idx === -1) {
        state.favoriteLines.push(text);
        showToast('⭐ Adicionada aos favoritos!', 'success');
      } else {
        state.favoriteLines.splice(idx, 1);
        showToast('Removida dos favoritos', 'info');
      }
      salvarEstado();
      renderLines();
    });
  });
}

/* =====================================================================
   16. PERFIL
   ===================================================================== */

function renderProfile() {
  $('#profileNameDisplay').textContent = `${state.user.nome || 'Seu Nome'}, ${state.user.idade || '--'}`;
  $('#profileSubDisplay').textContent = `📍 ${state.user.cidade || 'Localização não definida'}`;
  $('#profileBioDisplay').textContent = state.user.bio || 'Adicione uma bio para se apresentar melhor!';
  setAvatar($('#profileEmoji'), state.user.fotos[0] || state.user.emoji);
  $('#profileEmoji').disabled = !photoUrl(state.user.fotos[0]);
  $('#profileAge').textContent = state.user.idade ? `${state.user.idade} anos` : '—';
  $('#profileGender').textContent = state.user.genero || '—';
  $('#profileLooking').textContent = state.user.interessadoEm || '—';
  $('#profileDistance').textContent = 'Sem filtro de distância';
  $('#profileAgeRange').textContent = `${state.prefs.idadeMin} - ${state.prefs.idadeMax}`;
  $('#profilePhotoCount').textContent = `${(state.user.fotos || []).length}/6`;

  // Interesses
  const container = $('#profileInterests');
  if (state.user.interesses && state.user.interesses.length > 0) {
    container.innerHTML = state.user.interesses.map(i => `<span class="chip static">${escapeHtml(i)}</span>`).join('');
  } else {
    container.innerHTML = '<span class="chip static">Adicione seus interesses</span>';
  }

  // Stats
  renderProfileStats();

  // E-mail nas settings
  $('#settingsEmail').textContent = state.user.email || 'usuario@email.com';
}

function renderProfileStats() {
  $('#statMatches').textContent = state.matches.length;
  $('#statLikes').textContent = state.swipedIds.length;
}

let matchedProfileId = null;
let matchedProfileRequest = 0;
let matchedProfileTrigger = null;

function unavailableMatchedProfile(message, retry = false) {
  $('#matchedProfileContent').classList.add('hidden');
  $('#matchedProfilePhotos').replaceChildren();
  $('#matchedProfileStatus').textContent = message;
  $('#retryMatchedProfile').classList.toggle('hidden', !retry);
}

async function openMatchedProfile(id) {
  if (state.mode !== 'dating') return;
  if (!id || !state.userId) return;
  const modal = $('#matchedProfileModal');
  if (!modal.classList.contains('show')) matchedProfileTrigger = document.activeElement;
  matchedProfileId = id;
  const request = ++matchedProfileRequest;
  $('#matchedProfileName').textContent = 'Perfil do match';
  unavailableMatchedProfile('Carregando perfil…');
  modal.classList.add('show');
  $('#closeMatchedProfile').focus();
  try {
    // Reload through the authenticated match relation; never trust a stale card after a reset/block.
    await carregarMatches();
    if (request !== matchedProfileRequest || !modal.classList.contains('show')) return;
    const profile = state.matches.find(m => m.id === id);
    if (!profile) {
      unavailableMatchedProfile('Este match não está mais disponível. Ele pode ter sido desfeito, resetado ou bloqueado.');
      return;
    }
    $('#matchedProfileName').textContent = `${profile.nome}, ${profile.idade || '—'}`;
    $('#matchedProfileCity').textContent = profile.cidade || 'Cidade não informada';
    $('#matchedProfileBio').textContent = profile.bio || 'Esta pessoa ainda não adicionou uma bio.';
    $('#matchedProfileInfo').textContent = [profile.genero, profile.profissao, profile.signo].filter(Boolean).join(' · ');
    const photos = profile.fotos.filter(photo => photoUrl(photo)).slice(0, 6);
    $('#matchedProfilePhotos').innerHTML = photos.length
      ? photos.map((photo, index) => `<img src="${escapeHtml(photoUrl(photo))}" alt="Foto ${index + 1} do perfil" loading="lazy" />`).join('')
      : `<div class="matched-profile-avatar">${avatarHtml(profile.avatar)}</div>`;
    $('#matchedProfileInterests').innerHTML = profile.interesses.length
      ? profile.interesses.map(interest => `<span class="chip static">${escapeHtml(interest)}</span>`).join('')
      : '<span>Nenhum interesse informado.</span>';
    $('#matchedProfileStatus').textContent = '';
    $('#matchedProfileContent').classList.remove('hidden');
  } catch {
    if (request === matchedProfileRequest) unavailableMatchedProfile('Não foi possível carregar o perfil. Verifique a conexão e tente novamente.', true);
  }
}

function closeMatchedProfile() {
  ++matchedProfileRequest;
  matchedProfileId = null;
  $('#matchedProfileModal').classList.remove('show');
  unavailableMatchedProfile('');
  if (matchedProfileTrigger?.isConnected) matchedProfileTrigger.focus();
}

function setupMatchedProfile() {
  $('#closeMatchedProfile').onclick = closeMatchedProfile;
  $('#retryMatchedProfile').onclick = () => openMatchedProfile(matchedProfileId);
  $('#roomAvatar').onclick = $('#roomProfile').onclick = () => openMatchedProfile(state.currentChat);
  $('#matchedProfileChat').onclick = () => {
    const id = matchedProfileId;
    closeMatchedProfile();
    abrirChat(id);
  };
  const modal = $('#matchedProfileModal');
  modal.addEventListener('click', e => { if (e.target === modal) closeMatchedProfile(); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeMatchedProfile(); }
    if (e.key === 'Tab') {
      const buttons = [...modal.querySelectorAll('button')].filter(b => b.getClientRects().length && !b.disabled);
      const index = buttons.indexOf(document.activeElement);
      e.preventDefault();
      buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
}

/* =====================================================================
   17. EDITAR PERFIL
   ===================================================================== */

function loadEditProfile() {
  editPhotos = [...state.user.fotos];
  renderEditPhotos();
  $('#editPhotoInput').onchange = addEditPhotos;
  $('#editName').value = state.user.nome || '';
  $('#editAge').value = state.user.idade || 25;
  $('#editCity').value = state.user.cidade || '';
  $('#editGender').value = state.user.genero || 'Prefiro não dizer';
  $('#editLooking').value = state.user.interessadoEm || 'Todos';
  $('#editBio').value = state.user.bio || '';
  $('#editBioCount').textContent = (state.user.bio || '').length;
  $('#editDistance').value = state.prefs.distancia || 50;
  $('#distValue').textContent = 'não disponível';
  $('#editAgeMin').value = state.prefs.idadeMin || 18;
  $('#editAgeMax').value = state.prefs.idadeMax || 45;

  // Interesses
  renderEditInterests();

  // Contador bio
  $('#editBio').oninput = e => { $('#editBioCount').textContent = e.target.value.length; };

  // Slider distância
  $('#editDistance').oninput = e => { $('#distValue').textContent = e.target.value + ' km'; };
}

function renderEditInterests() {
  const container = $('#editInterests');
  const selecionados = new Set(state.user.interesses || []);

  container.innerHTML = INTERESTS.map(i => `
    <div class="chip ${selecionados.has(i) ? 'selected' : ''}" data-value="${i}">${i}</div>
  `).join('');

  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });
}

async function salvarPerfil() {
  if (salvarPerfil.busy || editingPhotoUpload) return;
  if (!editPhotos.length) { showToast('Mantenha pelo menos uma foto no perfil.', 'error'); return; }
  const nome = $('#editName').value.trim();
  const min = Number($('#editAgeMin').value), max = Number($('#editAgeMax').value);
  if (!nome || min < 18 || max < min || max > 120) { showToast('Informe um nome e uma faixa etária válida (18–120).', 'error'); return; }
  const changes = {name:nome, city:$('#editCity').value.trim(), gender:$('#editGender').value,
    looking_for:$('#editLooking').value, bio:$('#editBio').value.trim(),
    photos:editPhotos, avatar:editPhotos[0] || state.user.emoji,
    interests:[...document.querySelectorAll('#editInterests .chip.selected')].map(c => c.dataset.value),
    updated_at:new Date().toISOString()};
  if (changes.interests.length < 3) { showToast('Escolha pelo menos 3 interesses.', 'error'); return; }
  salvarPerfil.busy = true;
  try {
    const { data, error } = await sparkClient.from('profiles').update(changes).eq('id',state.userId).select('id').single();
    if (error || !data) throw error || new Error('Perfil não encontrado');
    Object.assign(state.user, {nome, fotos:[...changes.photos], emoji:changes.avatar, cidade:changes.city, genero:changes.gender,
      interessadoEm:changes.looking_for, bio:changes.bio, interesses:changes.interests});
    state.prefs = {distancia:Number($('#editDistance').value), idadeMin:min, idadeMax:max};
    Object.assign(state.filters, state.prefs);
    state.discoveryDirty = true;
    salvarEstado();
    navigate('profile');
    showToast('Perfil salvo com sucesso!', 'success');
  } catch { showToast('Perfil não salvo. Seus campos foram mantidos; tente novamente.', 'error'); }
  finally { salvarPerfil.busy = false; }
}

/* =====================================================================
   18. NOTIFICAÇÕES
   ===================================================================== */

async function renderNotifications() {
  if (!state.userId) return;
  const { data, error } = await sparkClient.from('notifications').select('*')
    .eq('user_id', state.userId).order('created_at', { ascending: false }).limit(50);
  if (error) { $('#notifList').textContent = 'Não foi possível carregar notificações. Tente novamente.'; return; }
  state.notifications = data || [];
  displayNotifications();
  atualizarTodosBadges();
}

function displayNotifications() {
  const list = $('#notifList');
  if (!state.notifications.length) {
    list.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div><h3>Sem notificações</h3><p>Quando alguém curtir, dar match ou mandar mensagem, você verá aqui.</p></div>';
    return;
  }
  const notifications = state.notifications.slice(0, 50);
  const icons = {match:'💖', like:'💗', message:'💬', super_like:'⭐'};
  list.innerHTML = notifications.map(n => `
    <button type="button" class="notif-item ${n.read ? '' : 'unread'}">
      <span class="notif-icon">${icons[n.type] || '🔔'}</span>
      <span class="notif-content">
        <strong>${escapeHtml(n.title)}</strong>
        <span>${escapeHtml(n.body || n.text || '')}</span>
      </span>
      <span class="notif-time">${tempoRelativo(new Date(n.created_at || n.timestamp).getTime())}</span>
    </button>`).join('');
  list.querySelectorAll('.notif-item').forEach((button, index) => {
    button.addEventListener('click', async () => {
      if (notificationBusy) return;
      notificationBusy = true;
      button.disabled = true;
      try { await openNotification(notifications[index]); }
      catch { showToast('Não foi possível abrir a notificação. Verifique a conexão e tente novamente.', 'error'); }
      finally { notificationBusy = false; button.disabled = false; }
    });
  });
}

let notificationBusy = false;
async function openNotification(notification) {
  const {error} = await sparkClient.from('notifications').update({read:true})
    .eq('user_id', state.userId).eq('id', notification.id);
  if (!error) {
    state.notifications.filter(n => n.id === notification.id).forEach(n => n.read = true);
    displayNotifications();
    atualizarTodosBadges();
  } else showToast('Não foi possível marcar como lida. Você pode tentar novamente.', 'info');

  if (['message', 'match'].includes(notification.type)) {
    await carregarMatches();
    const match = state.matches.find(m => m.id === notification.related_user_id);
    if (!match) {
      showToast('Este match não está mais disponível. Ele pode ter sido desfeito, resetado ou bloqueado.', 'info');
      return;
    }
    if (notification.type === 'message') abrirChat(match.id);
    else await openMatchedProfile(match.id);
  } else if (['like', 'super_like'].includes(notification.type)) {
    navigate('likes');
  } else {
    showInfo(notification.title || 'Notificação', notification.body || notification.text || 'Sem detalhes adicionais.');
  }
}

/* =====================================================================
   19. BADGES
   ===================================================================== */

function atualizarTodosBadges() {
  const totalUnread = Object.values(state.unread).reduce((a, b) => a + b, 0);
  const unreadNotifs = state.notifications.filter(n => !n.read).length;

  // Nav badge
  const navBadge = $('#navMatchBadge');
  if (navBadge) {
    navBadge.textContent = totalUnread;
    navBadge.classList.toggle('hidden', totalUnread === 0);
  }

  // Notif badge
  const notifBadge = $('#notifBadge');
  if (notifBadge) {
    notifBadge.textContent = unreadNotifs;
    notifBadge.classList.toggle('hidden', unreadNotifs === 0);
  }
}

/* =====================================================================
   20. PREMIUM
   ===================================================================== */

function openPremium() {
  $('#premiumModal').classList.add('show');
}

function setupPremium() {
  $('#closePremiumBtn').onclick = () => $('#premiumModal').classList.remove('show');
  $('#premiumBanner').onclick = openPremium;
}

/* =====================================================================
   21. MODAL DE MENU DO CHAT
   ===================================================================== */

function setupChatMenu() {
  $('#chatMenuBtn').addEventListener('click', () => {
    $('#chatMenuModal').classList.add('show');
  });

  $('#chatMenuClose').addEventListener('click', () => {
    $('#chatMenuModal').classList.remove('show');
  });

  $('#chatViewProfile').addEventListener('click', () => {
    $('#chatMenuModal').classList.remove('show');
    openMatchedProfile(state.currentChat);
  });

  $('#chatUnmatch').addEventListener('click', async () => {
    const perfil = state.matches.find(m => m.id === state.currentChat);
    if (!perfil || !confirm(`Desfazer match com ${perfil.nome}?`)) return;
    const button = $('#chatUnmatch');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const {data, error} = await sparkClient.from('matches').update({active:false}).eq('id', perfil.matchId).select('id').single();
      if (error || !data) throw error || new Error('Match não encontrado');
      state.matches = state.matches.filter(m => m.id !== perfil.id);
      delete state.chats[perfil.id]; delete state.unread[perfil.id];
      $('#chatMenuModal').classList.remove('show');
      fecharChat();
      atualizarTodosBadges(); renderProfileStats();
      showToast('Match desfeito.', 'success');
    } catch { showToast('Não foi possível desfazer o match. Tente novamente.', 'error'); }
    finally { button.disabled = false; }
  });

  $('#chatReport').addEventListener('click', () => {
    $('#chatMenuModal').classList.remove('show');
    $('#reportModal').classList.add('show');
  });
}

function setupReport() {
  $$('.report-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.report-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  $('#confirmReport').addEventListener('click', async () => {
    const selected = document.querySelector('.report-option.selected');
    const id = state.currentChat;
    if (!selected || !id) { showToast('Selecione um motivo e um contato.', 'error'); return; }
    const button = $('#confirmReport');
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (button.dataset.reported !== id) {
        const {error} = await sparkClient.from('reports').insert({reporter_id:state.userId, reported_id:id, reason:selected.dataset.reason, details:''});
        if (error) throw error;
        button.dataset.reported = id;
      }
      const {error} = await sparkClient.from('blocks').insert({blocker_id:state.userId, blocked_id:id});
      if (error && error.code !== '23505') throw error;
      state.blockList.push(id);
      state.deck = state.deck.filter(p => p.id !== id);
      state.matches = state.matches.filter(m => m.id !== id);
      delete state.chats[id]; delete state.unread[id];
      $('#reportModal').classList.remove('show');
      fecharChat(); atualizarTodosBadges();
      showToast('Denúncia registrada e contato bloqueado. Análise manual pelos responsáveis.', 'success');
      delete button.dataset.reported;
    } catch {
      showToast(button.dataset.reported === id ? 'Denúncia registrada, mas o bloqueio falhou. Toque novamente para tentar bloquear.' : 'Denúncia não enviada. Tente novamente.', 'error');
    } finally { button.disabled = false; }
  });

  $('#cancelReport').addEventListener('click', () => {
    $('#reportModal').classList.remove('show');
  });
}

/* =====================================================================
   22. FILTROS
   ===================================================================== */

function setupFilters() {
  $('#btnFilter').addEventListener('click', () => {
    // Popula valores atuais
    $('#filterDistance').value = state.filters.distancia;
    $('#filterDistValue').textContent = 'não disponível';
    $('#filterAgeMin').value = state.filters.idadeMin;
    $('#filterAgeMax').value = state.filters.idadeMax;
    $('#filterVerified').checked = state.filters.apenasVerificados;

    $$('#filterGenderChips .chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.value === state.filters.genero);
    });

    $('#filterModal').classList.add('show');
  });

  $('#filterDistance').addEventListener('input', (e) => {
    $('#filterDistValue').textContent = e.target.value + ' km';
  });

  $$('#filterGenderChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#filterGenderChips .chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  $('#applyFilters').addEventListener('click', () => {
    const min = Number($('#filterAgeMin').value), max = Number($('#filterAgeMax').value);
    if (min < 18 || max < min || max > 120) { showToast('Faixa etária inválida.', 'error'); return; }
    state.filters.distancia = parseInt($('#filterDistance').value);
    state.filters.idadeMin = parseInt($('#filterAgeMin').value);
    state.filters.idadeMax = parseInt($('#filterAgeMax').value);
    state.filters.apenasVerificados = $('#filterVerified').checked;

    const genderChip = document.querySelector('#filterGenderChips .chip.selected');
    state.filters.genero = genderChip ? genderChip.dataset.value : 'Todos';

    $('#filterModal').classList.remove('show');
    iniciarApp();
    salvarEstado();
  });

  $('#resetFilters').addEventListener('click', () => {
    state.filters = {
      distancia: 50,
      idadeMin: 18,
      idadeMax: 45,
      genero: 'Todos',
      apenasVerificados: false,
    };
    $('#filterDistance').value = 50;
    $('#filterDistValue').textContent = 'não disponível';
    $('#filterAgeMin').value = 18;
    $('#filterAgeMax').value = 45;
    $('#filterVerified').checked = false;
    $$('#filterGenderChips .chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.value === 'Todos');
    });
    iniciarApp();
    salvarEstado();
    showToast('Filtros redefinidos', 'info');
  });
}

/* =====================================================================
   23. CONFIGURAÇÕES
   ===================================================================== */

let activityResetBusy = false;

function setupActivityReset() {
  const modal = $('#resetActivityModal');
  const confirmButton = $('#confirmActivityReset');
  const cancelButton = $('#cancelActivityReset');
  const status = $('#resetActivityStatus');
  let mode = null;
  let opener = null;
  function close() {
    if (activityResetBusy) return;
    modal.classList.remove('show');
    mode = null;
    opener?.focus();
  }
  function open(nextMode, button) {
    if (activityResetBusy) return;
    mode = nextMode;
    opener = button;
    $('#resetActivityTitle').textContent = mode === 'nope' ? 'Rever perfis recusados?' : 'Resetar curtidas e matches?';
    $('#resetActivityDescription').textContent = mode === 'nope'
      ? 'Remove somente suas recusas (nope), para avaliar esses perfis novamente. Suas curtidas, matches e conversas não serão apagados.'
      : 'Apaga suas curtidas e recusas, todos os seus matches (inclusive desfeitos) e as mensagens desses matches para os dois participantes. As curtidas recíprocas desses matches também serão removidas: vocês precisarão se curtir novamente. Não afeta conversas entre outras pessoas. Esta ação não pode ser desfeita.';
    status.textContent = '';
    confirmButton.textContent = 'Confirmar reset';
    modal.classList.add('show');
    cancelButton.focus();
  }
  $('#resetNopesBtn').onclick = e => open('nope', e.currentTarget);
  $('#resetActivityBtn').onclick = e => open('all', e.currentTarget);
  cancelButton.onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!activityResetBusy) (document.activeElement === cancelButton ? confirmButton : cancelButton).focus();
    }
  });
  confirmButton.onclick = async () => {
    if (activityResetBusy || !mode || !state.userId) return;
    activityResetBusy = true;
    confirmButton.disabled = cancelButton.disabled = true;
    confirmButton.textContent = 'Resetando…';
    status.textContent = 'Aguarde a confirmação do servidor.';
    let completed = false;
    try {
      // Drain an earlier refresh before clearing caches so it cannot restore deleted matches.
      while (syncBusy) await new Promise(resolve => setTimeout(resolve, 50));
      const { error } = await sparkClient.rpc('reset_my_test_activity', { reset_mode: mode });
      if (error) throw error;
      completed = true;
      fecharChat();
      state.lastSwiped = null;
      state.deck = [];
      state.swipedIds = [];
      if (mode === 'all') {
        $('#matchModal').classList.remove('show');
        state.matches = [];
        state.chats = {};
        state.unread = {};
        state.notifications = [];
        renderMatches();
        renderChatList();
        $('#notifList').replaceChildren();
      }
      state.discoveryDirty = true;
      atualizarTodosBadges();
      renderProfileStats();
      status.textContent = 'Reset confirmado. Atualizando os perfis…';
      await iniciarApp();
      showToast(state.discoveryDirty ? 'Reset salvo. Não foi possível atualizar os perfis; abra Descobrir para tentar novamente.' : mode === 'nope' ? 'Recusas removidas. Você pode avaliar os perfis novamente.' : 'Curtidas e matches resetados. Vocês já podem testar novamente.', state.discoveryDirty ? 'info' : 'success');
    } catch {
      status.textContent = 'Não foi possível confirmar o reset. Verifique a conexão e tente novamente. Se a conexão caiu após o envio, atualize os dados antes de repetir.';
    } finally {
      activityResetBusy = false;
      confirmButton.disabled = cancelButton.disabled = false;
      confirmButton.textContent = 'Confirmar reset';
      if (completed) { close(); refreshActivity(); }
    }
  };
}

function confirmLogout() {
  if (confirm('Deseja sair da sua conta? Seus dados serão mantidos.')) {
    resetarEstado();
  }
}

/* =====================================================================
   24. ATALHOS DE TECLADO
   ===================================================================== */

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ignora se estiver digitando em input
    if (e.target.matches('input, textarea')) return;

    if ($('.modal-backdrop.show') && e.key !== 'Escape') return;
    if (state.currentScreen === 'discover') {
      if (e.key === 'ArrowLeft') { e.preventDefault(); $('#btnNope').click(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); $('#btnLike').click(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); $('#btnSuper').click(); }
      if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); $('#btnRewind').click(); }
    }

    if (e.key === 'Escape') {
      if (activityResetBusy) return;
      // Fecha modais
      $$('.modal-backdrop.show').forEach(m => m.classList.remove('show'));
      // Fecha chat
      if ($('#chatRoom').classList.contains('open')) fecharChat();
    }
  });
}

/* =====================================================================
   25. INICIALIZAÇÃO
   ===================================================================== */

function updateConnectionStatus(available) {
  const offline = !navigator.onLine;
  $('#connectionStatus').classList.toggle('hidden', available && !offline);
  $('#connectionMessage').textContent = offline
    ? 'Sem internet. Conecte o celular ao Wi-Fi ou aos dados móveis.'
    : 'Não foi possível acessar o servidor. Verifique a internet e tente novamente.';
}

async function cloudFetch(url, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15000);
  options.signal?.addEventListener('abort', abort, {once:true});
  if (options.signal?.aborted) abort();
  try {
    const response = await fetch(url, {...options, signal:controller.signal});
    updateConnectionStatus(response.status < 500);
    return response;
  } catch (error) {
    if (!options.signal?.aborted) updateConnectionStatus(false);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function retryConnection() {
  const button = $('#retryConnection');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/settings`, {headers:{apikey:SUPABASE_ANON_KEY}});
    if (!response.ok) { updateConnectionStatus(false); return; }
    if (state.currentScreen === 'auth') {
      if (await carregarEstado()) await enterCampus();
    } else if (state.currentScreen === 'campus') {
      await window.CampusModes.refresh();
    } else if (state.currentScreen === 'discover' && state.discoveryDirty) {
      await iniciarApp();
    } else {
      await refreshActivity();
      if (state.currentScreen === 'notifications') await renderNotifications();
      if (matchedProfileId) await openMatchedProfile(matchedProfileId);
    }
  } catch { updateConnectionStatus(false); }
  finally { button.disabled = false; }
}

async function init() {
  // Local controls must work before any network request.
  setupAuth();
  setupRecovery();
  navigate('auth');
  // Inicializa cliente Supabase
  sparkClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {fetch:cloudFetch},
  });
  updateConnectionStatus(navigator.onLine);
  $('#retryConnection').onclick = retryConnection;
  window.addEventListener('offline', () => updateConnectionStatus(false));
  window.addEventListener('online', retryConnection);

  // Configura listener de auth para mudanças de sessão
  sparkClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      window.CampusModes.close();
      modeGeneration++;
      state.mode = null;
      clearInterval(syncTimer);
      Object.values(state.chatSubscriptions).forEach(ch => {
        sparkClient.removeChannel(ch);
      });
      state.chatSubscriptions = {};
    }
  });

  // Session restoration runs after all controls are connected.
  // Setup global
  setupModeShell();
  setupBottomNav();
  setupPremium();
  setupChatMenu();
  setupReport();
  setupFilters();
  setupActivityReset();
  setupMatchedProfile();
  setupKeyboard();

  // Handlers dos botões de ação
  $('#btnLike').addEventListener('click', () => {
    const cards = $$('.profile-card');
    const top = cards[cards.length - 1];
    if (top) soltarCarta(top, 'like');
  });

  $('#btnNope').addEventListener('click', () => {
    const cards = $$('.profile-card');
    const top = cards[cards.length - 1];
    if (top) soltarCarta(top, 'nope');
  });

  $('#btnSuper').addEventListener('click', () => {
    const cards = $$('.profile-card');
    const top = cards[cards.length - 1];
    if (!top) return;

    const flash = $('#superFlash');
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 700);

    setTimeout(() => soltarCarta(top, 'super'), 250);
  });

  $('#btnRewind').addEventListener('click', () => showToast('Voltar não está disponível nesta versão acadêmica.', 'info'));
  $('#btnBoost').addEventListener('click', () => showToast('Boost não está disponível nesta versão acadêmica.', 'info'));

  // Notificações
  $('#btnNotif').addEventListener('click', () => navigate('notifications'));

  $('#clearNotifsBtn').addEventListener('click', async () => {
    // Marca todas como lidas no Supabase
    if (state.userId) {
      try {
        const {error} = await sparkClient
          .from('notifications')
          .update({ read: true })
          .eq('user_id', state.userId);
        if (error) throw error;
      } catch (err) {
        showToast('Não foi possível marcar notificações como lidas.', 'error');
        return;
      }
    }
    state.notifications.forEach(n => { n.read = true; });
    atualizarTodosBadges();
    renderNotifications();
    salvarEstado();
    showToast('Notificações marcadas como lidas', 'info');
  });

  // Chat
  $('#closeChatBtn').addEventListener('click', fecharChat);
  $('#sendBtn').addEventListener('click', () => enviarMensagem());
  $('#chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarMensagem();
  });

  $('#chatSearch').addEventListener('input', renderChatList);

  // Quick replies
  $$('.quick-reply').forEach(qr => {
    qr.addEventListener('click', () => enviarMensagem(qr.dataset.text));
  });

  // Sticker picker
  const picker = $('#stickerPicker');
  picker.innerHTML = STICKERS.map(s => `<div class="sticker-option" data-emoji="${s}">${s}</div>`).join('');

  $('#stickerBtn').addEventListener('click', () => {
    picker.classList.toggle('hidden');
  });

  picker.querySelectorAll('.sticker-option').forEach(opt => {
    opt.addEventListener('click', () => enviarSticker(opt.dataset.emoji));
  });

  // Perfil - botões
  $('#goSettings').addEventListener('click', () => navigate('settings'));
  $('#backFromSettings').addEventListener('click', () => navigate('profile'));
  $('#editProfileBtn').addEventListener('click', () => navigate('edit-profile'));
  $('#backFromEdit').addEventListener('click', () => navigate('profile'));
  $('#saveProfile').addEventListener('click', salvarPerfil);
  $('#saveProfileBottom').addEventListener('click', salvarPerfil);

  $('#profileEmoji').addEventListener('click', () => {
    const url = photoUrl(state.user.fotos[0]);
    if (!url) return;
    $('#profilePhotoPreview').src = url;
    $('#profilePhotoModal').classList.add('show');
    $('#closeProfilePhoto').focus();
  });
  const closePhoto = () => {
    $('#profilePhotoModal').classList.remove('show');
    $('#profilePhotoPreview').removeAttribute('src');
    $('#profileEmoji').focus();
  };
  $('#closeProfilePhoto').onclick = closePhoto;
  $('#profilePhotoModal').addEventListener('click', e => { if (e.target === e.currentTarget) closePhoto(); });
  $('#profilePhotoModal').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closePhoto(); }
    if (e.key === 'Tab') { e.preventDefault(); $('#closeProfilePhoto').focus(); }
  });
  $('#editAvatarBtn').addEventListener('click', () => navigate('edit-profile'));
  $('#editInterestsBtn').addEventListener('click', () => navigate('edit-profile'));
  $('#editInfoBtn').addEventListener('click', () => navigate('edit-profile'));

  // Settings toggles
  ['settingLocation', 'settingGlobal', 'settingNotifMsg', 'settingNotifLike'].forEach(id => {
    const el = $('#' + id);
    if (el) {
      el.addEventListener('change', () => {
        state.settings[id.charAt(7).toLowerCase() + id.slice(8)] = el.checked;
        salvarEstado();
      });
    }
  });

  if (await carregarEstado()) await enterCampus();

  document.addEventListener('visibilitychange', refreshActivity);
  // Auto-save
  setInterval(salvarEstado, 30000);

  // Ajusta deck ao redimensionar
  window.addEventListener('resize', ajustarDeck);
  ajustarDeck();
}

function ajustarDeck() {
  const deck = $('#deck');
  if (!deck) return;
  const h = $('#app').clientHeight - ($('#app').classList.contains('has-mode-bar') ? 48 : 0);
  const altura = Math.min(600, h - 280);
  deck.style.height = Math.max(180, altura) + 'px';
}

/* =====================================================================
   26. BOOT
   ===================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  init().catch(() => showToast('Não foi possível iniciar a conexão. Verifique a internet e reabra o aplicativo.', 'error'));
});

