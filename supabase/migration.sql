-- Spark UPX - Schema Supabase
-- Projeto de namoro para matéria UPX na FACENS
-- Fresh install order: migration.sql -> rls-policies.sql -> mvp-fixes.sql.
-- Existing database: apply mvp-fixes.sql only (idempotent, no seed replay).

-- ============================================================
-- EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELAS PRINCIPAIS
-- ============================================================

-- Perfis dos usuários (linkados ao auth.users do Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date DATE,
  age INTEGER,
  gender TEXT,
  looking_for TEXT DEFAULT 'todos',
  bio TEXT DEFAULT '',
  avatar TEXT DEFAULT '🦄',
  color1 TEXT DEFAULT '#8B5CF6',
  color2 TEXT DEFAULT '#EC4899',
  city TEXT DEFAULT 'São Paulo, SP',
  latitude REAL,
  longitude REAL,
  profession TEXT DEFAULT '',
  sign TEXT DEFAULT '',
  verified BOOLEAN DEFAULT false,
  online BOOLEAN DEFAULT false,
  onboarding_complete BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  show_distance BOOLEAN DEFAULT true,
  show_age BOOLEAN DEFAULT true,
  show_online BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interesses dos usuários
CREATE TABLE IF NOT EXISTS user_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interest TEXT NOT NULL,
  UNIQUE(user_id, interest)
);

-- Fotos dos usuários
CREATE TABLE IF NOT EXISTS user_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Filtros de descoberta do usuário
CREATE TABLE IF NOT EXISTS user_filters (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 60,
  max_distance INTEGER DEFAULT 50,
  gender_filter TEXT DEFAULT 'todos',
  show_verified_only BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SWIPES E MATCHES
-- ============================================================

-- Swipes (likes/nopes/superlikes)
CREATE TABLE IF NOT EXISTS swipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  swiper_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  swiped_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('like', 'nope', 'super')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(swiper_id, swiped_id)
);

-- Matches (mútuo)
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_super BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- ============================================================
-- CHAT
-- ============================================================

-- Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sticker_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MODERAÇÃO
-- ============================================================

-- Denúncias
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bloqueios
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('match', 'message', 'like', 'super_like', 'system')),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  avatar TEXT DEFAULT '🔔',
  related_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PREMIUM
-- ============================================================

CREATE TABLE IF NOT EXISTS premium_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_brl REAL NOT NULL,
  duration_days INTEGER NOT NULL,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES premium_plans(id),
  active BOOLEAN DEFAULT true,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTEÚDO
-- ============================================================

CREATE TABLE IF NOT EXISTS pickup_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL DEFAULT 'Clássicas',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  label TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorite_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES pickup_lines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, line_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped ON swipes(swiped_id);
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);

-- ============================================================
-- TRIGGER: atualizar updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_filters_updated_at
  BEFORE UPDATE ON user_filters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGER: criar perfil automaticamente ao registrar
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, birth_date)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'birth_date', ''), NULL)::DATE
  );
  INSERT INTO user_filters (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Remove trigger se já existir e recria
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: detectar match ao inserir swipe
-- ============================================================

CREATE OR REPLACE FUNCTION check_match_on_swipe()
RETURNS TRIGGER AS $$
DECLARE
  mutual_swipe RECORD;
  match_id UUID;
  smaller_id UUID;
  larger_id UUID;
BEGIN
  -- Só verifica match em likes e super likes
  IF NEW.direction = 'nope' THEN RETURN NEW; END IF;

  -- Verifica se o outro usuário já curtiu de volta
  SELECT * INTO mutual_swipe
  FROM swipes
  WHERE swiper_id = NEW.swiped_id
    AND swiped_id = NEW.swiper_id
    AND direction IN ('like', 'super');

  IF FOUND THEN
    -- Ordena IDs para consistência
    IF NEW.swiper_id < NEW.swiped_id THEN
      smaller_id := NEW.swiper_id;
      larger_id := NEW.swiped_id;
    ELSE
      smaller_id := NEW.swiped_id;
      larger_id := NEW.swiper_id;
    END IF;

    -- Cria match
    INSERT INTO matches (user1_id, user2_id, is_super)
    VALUES (smaller_id, larger_id, NEW.direction = 'super' OR mutual_swipe.direction = 'super')
    ON CONFLICT (user1_id, user2_id) DO NOTHING
    RETURNING id INTO match_id;

    -- Notificação de match para ambos
    IF match_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, related_user_id)
      VALUES
        (NEW.swiper_id, 'match', '💖 Novo match!', 'Vocês se curtiram! Comece a conversar.', NEW.swiped_id),
        (NEW.swiped_id, 'match', '💖 Novo match!', 'Vocês se curtiram! Comece a conversar.', NEW.swiper_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_match ON swipes;
CREATE TRIGGER trigger_check_match
  AFTER INSERT ON swipes
  FOR EACH ROW EXECUTE FUNCTION check_match_on_swipe();

-- ============================================================
-- TRIGGER: notificação de nova mensagem
-- ============================================================

CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
  receiver_id UUID;
  match_record RECORD;
BEGIN
  -- Encontra o match e o destinatário
  SELECT * INTO match_record FROM matches WHERE id = NEW.match_id;
  IF match_record.user1_id = NEW.sender_id THEN
    receiver_id := match_record.user2_id;
  ELSE
    receiver_id := match_record.user1_id;
  END IF;

  -- Insere notificação
  INSERT INTO notifications (user_id, type, title, body, related_user_id)
  VALUES (receiver_id, 'message', '💬 Nova mensagem', NEW.content, NEW.sender_id);

  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_message_notification ON messages;
CREATE TRIGGER trigger_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ============================================================
-- DADOS INICIAIS (seed)
-- ============================================================

-- Planos premium
INSERT INTO premium_plans (id, name, price_brl, duration_days, features) VALUES
  ('spark_basic', 'Spark Básico', 0, 9999, '["likes ilimitados", "1 super like por dia", "chat básico"]'::jsonb),
  ('spark_plus', 'Spark Plus', 29.90, 30, '["likes ilimitados", "5 super likes por dia", "ver quem curtiu", "rewind ilimitado", "1 boost por mês", "sem anúncios"]'::jsonb),
  ('spark_vip', 'Spark VIP', 49.90, 30, '["likes ilimitados", "super likes ilimitados", "ver quem curtiu", "rewind ilimitado", "2 boosts por mês", "sem anúncios", "badge VIP", "destaque no feed", "filtros avançados"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Cantadas
INSERT INTO pickup_lines (category, text) VALUES
  ('Clássicas', 'Você deve ser um bombeiro, porque incendiou meu coração. 🔥'),
  ('Clássicas', 'Perdi meu número de telefone. Posso pegar o seu? 📱'),
  ('Clássicas', 'Você acredita em amor à primeira vista ou devo passar de novo? 👀'),
  ('Clássicas', 'Se você fosse um vegetal, seria uma cenoura, porque me deixa apaixonado. 🥕'),
  ('Clássicas', 'Está com dor? Porque quando te vi, meu coração parou. 💓'),
  ('Engraçadas', 'Você é filha(o) de padeiro? Porque é um pedaço de mau caminho! 🥐'),
  ('Engraçadas', 'Você trabalha no Correios? Porque acabou de entregar meu coração. 📮'),
  ('Engraçadas', 'Se você fosse um hambúrguer, seria um X-Tudo, porque tem tudo que eu gosto. 🍔'),
  ('Engraçadas', 'Cê tem wi-fi? Porque senti uma conexão. 📶'),
  ('Engraçadas', 'Se apaixonar por você foi tão fácil que até meu GPS se perdeu. 🧭'),
  ('Geek', 'Você é feita(o) de cobre e telúrio? Porque é Cu-Te. ⚛️'),
  ('Geek', 'Se você fosse um bug, eu nunca iria querer corrigir. 💻'),
  ('Geek', 'Você é meu commit favorito, sempre volto pra você. 🖥️'),
  ('Geek', 'Você é tipo Wi-Fi forte: impossível resistir à conexão. 📡'),
  ('Geek', 'Se você fosse um jogo, eu jogaria a vida toda sem pause. 🎮'),
  ('Românticas', 'Se eu pudesse escolher entre você e o sol, escolheria você: você ilumina meus dias sem queimar. ☀️'),
  ('Românticas', 'Você é a música que eu quero ouvir pelo resto da vida. 🎶'),
  ('Românticas', 'Se o amor fosse visível, você seria um arco-íris. 🌈'),
  ('Românticas', 'Você não é uma estrela, mas ilumina minha noite como ninguém. ✨'),
  ('Românticas', 'Em um mundo de 8 bilhões de pessoas, meus olhos só procuram você. 🌍'),
  ('Ousadas', 'Não sou fotógrafo, mas posso imaginar nós dois juntos. 📸'),
  ('Ousadas', 'Você é tão doce que me deu diabetes. 🍬'),
  ('Ousadas', 'Meu coração disparou. Você é cardiologista? 💗'),
  ('Ousadas', 'Você está no topo da minha lista de melhores matches. 🏆'),
  ('Ousadas', 'Se beleza fosse crime, você pegaria prisão perpétua. 🔒')
ON CONFLICT DO NOTHING;