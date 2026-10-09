// src/db/seed.js
// Popula dados iniciais: perfis mock, pickup lines, stickers, interesses
const { getDb, saveDb } = require('./database');
const migrate = require('./migrate');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const INTERESTS = [
  '🎸 Música', '🎬 Cinema', '🎮 Games', '📚 Leitura', '✈️ Viagens',
  '🏋️ Academia', '🍳 Culinária', '🐕 Cachorros', '🐱 Gatos', '☕ Café',
  '🍺 Bar', '🎨 Arte', '📷 Fotografia', '🌸 Plantas', '🏄 Surfe',
  '🧘 Yoga', '🎭 Teatro', '🏀 Basquete', '⚽ Futebol', '🎹 Piano',
  '💻 Tecnologia', '🚴 Ciclismo', '🏕️ Acampamento', '🍣 Sushi', '🎵 Dança',
  '📝 Escrita', '🧑‍🍳 Gastronomia', '🎧 Podcasts', '🏛️ Museus', '🌅 Pôr do sol'
];

const PICKUP_LINES = [
  // Clássicas
  { cat: 'Clássicas', text: 'Você acredita em amor à primeira vista ou eu preciso passar de novo?' },
  { cat: 'Clássicas', text: 'Meu celular está sem você... quer dizer, sem sinal. Me ajuda?' },
  { cat: 'Clássicas', text: 'Você não é um dicionário, mas me deixou sem palavras.' },
  { cat: 'Clássicas', text: 'Se beleza fosse tempo, você seria a eternidade.' },
  { cat: 'Clássicas', text: 'Você é o Google? Porque tem tudo que eu procuro.' },
  // Engraçadas
  { cat: 'Engraçadas', text: 'Você gosta de Star Wars? Porque Yoda é linda!' },
  { cat: 'Engraçadas', text: 'Me chama de notificação e me clica!' },
  { cat: 'Engraçadas', text: 'Você é Wi-Fi? Porque estou sentindo uma conexão.' },
  { cat: 'Engraçadas', text: 'Se você fosse um bug, eu nunca te corrigiria.' },
  { cat: 'Engraçadas', text: 'Meu amor por você é que nem React: reativo e cheio de hooks.' },
  // Geek
  { cat: 'Geek', text: 'Você é o CSS do meu HTML — sem você eu não tenho estilo.' },
  { cat: 'Geek', text: 'SELECT * FROM pessoas WHERE beleza = "máxima" — e só veio você.' },
  { cat: 'Geek', text: 'Se nosso amor fosse um algoritmo, seria O(1) — constante e eterno.' },
  { cat: 'Geek', text: 'Você deve ser JavaScript, porque você é async e me deixa esperando.' },
  { cat: 'Geek', text: 'git commit -m "me apaixonei" && git push origin coração' },
  // Românticas
  { cat: 'Românticas', text: 'Seu sorriso ilumina mais que o sol de domingo.' },
  { cat: 'Românticas', text: 'Não sei o que é mais bonito: o pôr do sol ou você vendo o pôr do sol.' },
  { cat: 'Românticas', text: 'O universo conspirou pra gente se encontrar nesse app.' },
  { cat: 'Românticas', text: 'Você é aquele tipo de pessoa que faz o mundo parecer mais colorido.' },
  // Diretas
  { cat: 'Diretas', text: 'Vamos pular a parte da conversa no app e marcar um café?' },
  { cat: 'Diretas', text: 'Achei seu perfil incrível. Que tal a gente se conhecer?' },
  { cat: 'Diretas', text: 'Não sou bom com cantadas, mas sou ótimo em conversas reais.' },
  // Nerds
  { cat: 'Nerds', text: 'Você é tipo um shiny: rara e especial.' },
  { cat: 'Nerds', text: 'Nossa química seria mais explosiva que nitroglicerina.' },
  { cat: 'Nerds', text: 'Se você fosse um livro, eu te leria em uma noite.' },
];

const STICKERS = [
  '❤️', '😍', '🔥', '😘', '🥰', '😊', '😂', '🤗', '😎', '🙌',
  '💕', '✨', '🌟', '💫', '🎉', '🤩', '😇', '💪', '👏', '🎯',
  '🌸', '🌺', '💝', '😜', '🤭', '🫶', '💖', '😁', '🥳', '💗'
];

const MOCK_PROFILES = [
  { nome: 'Lucas', idade: 26, genero: 'Homem', avatar: '🧑‍🎤', cidade: 'São Paulo, SP', bio: 'Músico nas horas vagas, dev durante o dia. Curto rock, vinil e churrasco de domingo.', interests: ['🎸 Música', '🍺 Bar', '🐕 Cachorros', '🎬 Cinema', '🎮 Games'], verificado: true },
  { nome: 'Beatriz', idade: 23, genero: 'Mulher', avatar: '👩‍🎨', cidade: 'São Paulo, SP', bio: 'Designer gráfica apaixonada por aquarela e café coado. Adoro exposições e mercados de rua.', interests: ['🎨 Arte', '☕ Café', '📷 Fotografia', '🌸 Plantas'], verificado: true },
  { nome: 'Rafael', idade: 29, genero: 'Homem', avatar: '🧑‍🍳', cidade: 'Campinas, SP', bio: 'Chef de cozinha e amante de vinhos. Procuro alguém pra dividir a sobremesa (e a vida).', interests: ['🍳 Culinária', '✈️ Viagens', '🍷 Vinho', '🎬 Cinema'], verificado: false },
  { nome: 'Marina', idade: 24, genero: 'Mulher', avatar: '👩‍🔬', cidade: 'São Paulo, SP', bio: 'Cientista, corredora de rua e fã de Star Wars. Bora tomar um café e discutir teorias?', interests: ['🏃 Corrida', '☕ Café', '📚 Leitura', '🎮 Games'], verificado: true },
  { nome: 'Pedro', idade: 31, genero: 'Homem', avatar: '🧑‍💻', cidade: 'Santos, SP', bio: 'Dev fullstack, surfista de fim de semana. Sei fazer deploy e café — os dois essenciais.', interests: ['💻 Tecnologia', '🏄 Surfe', '🍺 Bar', '🎹 Piano'], verificado: true },
  { nome: 'Amanda', idade: 27, genero: 'Mulher', avatar: '👩‍🏫', cidade: 'São Paulo, SP', bio: 'Professora de yoga e vegetariana. Adoro trilhas, meditação e dias de chuva com chá.', interests: ['🧘 Yoga', '🏕️ Acampamento', '🍣 Sushi', '🌸 Plantas'], verificado: true },
  { nome: 'Thiago', idade: 25, genero: 'Homem', avatar: '🧑‍🎨', cidade: 'Guarulhos, SP', bio: 'Ilustrador e tatuador. Transformo sentimentos em arte e café em código.', interests: ['🎨 Arte', '🎮 Games', '🎬 Cinema', '☕ Café'], verificado: false },
  { nome: 'Juliana', idade: 22, genero: 'Mulher', avatar: '👩‍🎤', cidade: 'São Paulo, SP', bio: 'Cantora de MPB, estudante de psicologia. Procuro alguém que entenda meu caos criativo.', interests: ['🎸 Música', '📚 Leitura', '🎭 Teatro', '🎵 Dança'], verificado: true },
  { nome: 'Gabriel', idade: 28, genero: 'Homem', avatar: '🧑‍🏋️', cidade: 'Osasco, SP', bio: 'Personal trainer, fissurado em crossfit. Se aguentar meu ritmo, já é metade do caminho.', interests: ['🏋️ Academia', '🐕 Cachorros', '⚽ Futebol', '🍖 Churrasco'], verificado: true },
  { nome: 'Fernanda', idade: 30, genero: 'Mulher', avatar: '👩‍💼', cidade: 'São Paulo, SP', bio: 'Advogada, mas nos fins de semana sou cozinheira amadora. Vinho e massas são minha terapia.', interests: ['🍳 Culinária', '✈️ Viagens', '🍷 Vinho', '🐱 Gatos'], verificado: false },
  { nome: 'Henrique', idade: 26, genero: 'Homem', avatar: '🧑‍🔧', cidade: 'Santo André, SP', bio: 'Engenheiro mecânico que ama motos e rock. Bora dar um rolê?', interests: ['🎸 Música', '🏍️ Motos', '🍺 Bar', '🚴 Ciclismo'], verificado: true },
  { nome: 'Camila', idade: 29, genero: 'Mulher', avatar: '👩‍🚀', cidade: 'São José dos Campos, SP', bio: 'Engenheira aeroespacial. Nas horas vagas, leitora voraz e jogadora de vôlei.', interests: ['📚 Leitura', '✈️ Viagens', '🎮 Games', '🏐 Vôlei'], verificado: true },
  { nome: 'Vinicius', idade: 24, genero: 'Homem', avatar: '🧑‍🎓', cidade: 'São Paulo, SP', bio: 'Estudante de medicina, mas meu coração já está diagnosticado: pronto pra se apaixonar.', interests: ['🎬 Cinema', '☕ Café', '🎧 Podcasts', '🍣 Sushi'], verificado: false },
  { nome: 'Larissa', idade: 27, genero: 'Mulher', avatar: '👩‍🎨', cidade: 'São Paulo, SP', bio: 'Arquiteta de dia, artista de noite. Vamos construir algo juntos?', interests: ['🎨 Arte', '🏛️ Museus', '✈️ Viagens', '🌸 Plantas'], verificado: true },
  { nome: 'Felipe', idade: 32, genero: 'Homem', avatar: '🧑‍✈️', cidade: 'Campinas, SP', bio: 'Piloto comercial, vivendo entre nuvens. No solo, só quero um bom café e boa companhia.', interests: ['✈️ Viagens', '☕ Café', '🎹 Piano', '🌅 Pôr do sol'], verificado: true },
];

async function seed() {
  await migrate();

  const db = await getDb();

  // Limpa dados anteriores
  db.run('DELETE FROM user_interests');
  db.run('DELETE FROM user_photos');
  db.run('DELETE FROM user_filters');
  db.run('DELETE FROM user_location');
  db.run('DELETE FROM user_premium_history');
  db.run('DELETE FROM premium_plans');
  db.run('DELETE FROM notifications');
  db.run('DELETE FROM blocks');
  db.run('DELETE FROM reports');
  db.run('DELETE FROM messages');
  db.run('DELETE FROM matches');
  db.run('DELETE FROM swipes');
  db.run('DELETE FROM users');

  // Planos premium
  const insertPlan = db.prepare('INSERT INTO premium_plans (name, duration_months, price_brl, features) VALUES (?, ?, ?, ?)');
  insertPlan.run(['Mensal', 1, 29.90, 'Ver quem curtiu, Super Likes ilimitados, Boost por semana, Modo invisível, Sem anúncios']);
  insertPlan.run(['Trimestral', 3, 59.90, 'Ver quem curtiu, Super Likes ilimitados, Boost por semana, Modo invisível, Sem anúncios']);
  insertPlan.run(['Anual', 12, 149.90, 'Ver quem curtiu, Super Likes ilimitados, Boost por semana, Modo invisível, Sem anúncios, Selo premium']);

  // Perfis mock (usuários fake com senha padrão)
  const hash = await bcrypt.hash('123456', 10);
  const insertUser = db.prepare(`INSERT INTO users (id, email, password_hash, nome, idade, genero, interessado_em, cidade, bio, avatar_emoji, verificado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertInterest = db.prepare('INSERT INTO user_interests (user_id, interest) VALUES (?, ?)');
  const insertFilter = db.prepare('INSERT INTO user_filters (user_id) VALUES (?)');
  const insertLocation = db.prepare('INSERT INTO user_location (user_id, lat, lng) VALUES (?, ?, ?)');

  // Coordenadas aproximadas de SP
  const locations = [
    [-23.5505, -46.6333], [-23.5614, -46.6561], [-22.9099, -47.0626],
    [-23.5505, -46.6333], [-23.9629, -46.3339], [-23.5505, -46.6333],
    [-23.4667, -46.5183], [-23.5505, -46.6333], [-23.5352, -46.7754],
    [-23.5505, -46.6333], [-23.6789, -46.5437], [-23.1791, -45.8869],
    [-23.5505, -46.6333], [-23.5505, -46.6333], [-22.9099, -47.0626]
  ];

  for (let i = 0; i < MOCK_PROFILES.length; i++) {
    const p = MOCK_PROFILES[i];
    const id = uuid();
    insertUser.run([id, `mock${i}@spark.app`, hash, p.nome, p.idade, p.genero, 'todos', p.cidade, p.bio, p.avatar, p.verificado ? 1 : 0]);
    p.interests.forEach(inter => insertInterest.run([id, inter]));
    insertFilter.run([id]);
    insertLocation.run([id, locations[i][0], locations[i][1]]);
  }

  // Pickup lines
  const insertLine = db.prepare('INSERT INTO pickup_lines (cat, text) VALUES (?, ?)');
  PICKUP_LINES.forEach(l => insertLine.run([l.cat, l.text]));

  // Stickers
  const insertSticker = db.prepare('INSERT INTO stickers (emoji) VALUES (?)');
  STICKERS.forEach(s => insertSticker.run([s]));

  saveDb();
  console.log(`✅ Seed complete: ${MOCK_PROFILES.length} profiles, ${PICKUP_LINES.length} lines, ${STICKERS.length} stickers`);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = seed;