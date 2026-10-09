-- ============================================================
-- RLS POLICIES para Spark UPX
-- Legacy baseline for fresh installs. Always follow with mvp-fixes.sql.
-- Existing database: apply only mvp-fixes.sql; do not replay this baseline.
-- ============================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES - qualquer um pode ler, só dono edita
-- ============================================================
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- USER INTERESTS - público lê, dono edita
-- ============================================================
CREATE POLICY "Interests are viewable by everyone" ON user_interests
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own interests" ON user_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interests" ON user_interests
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- USER PHOTOS - público lê, dono gerencia
-- ============================================================
CREATE POLICY "Photos are viewable by everyone" ON user_photos
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own photos" ON user_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own photos" ON user_photos
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- USER FILTERS - só dono lê/edita
-- ============================================================
CREATE POLICY "Users can view own filters" ON user_filters
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own filters" ON user_filters
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own filters" ON user_filters
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- SWIPES - dono insere e lê seus próprios
-- ============================================================
CREATE POLICY "Users can view own swipes" ON swipes
  FOR SELECT USING (auth.uid() = swiper_id);

CREATE POLICY "Users can insert own swipes" ON swipes
  FOR INSERT WITH CHECK (auth.uid() = swiper_id);

-- ============================================================
-- MATCHES - participantes leem/escrevem
-- ============================================================
CREATE POLICY "Users can view their matches" ON matches
  FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can insert matches they belong to" ON matches
  FOR INSERT WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update their matches" ON matches
  FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ============================================================
-- MESSAGES - participantes do match leem/escrevem
-- ============================================================
CREATE POLICY "Users can view messages in their matches" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = messages.match_id
      AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
      AND m.active = true
    )
  );

CREATE POLICY "Users can insert messages in their matches" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = messages.match_id
      AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
      AND m.active = true
    )
  );

-- ============================================================
-- REPORTS - denunciante insere/lê seus reports
-- ============================================================
CREATE POLICY "Users can view own reports" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "Users can insert reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ============================================================
-- BLOCKS - bloqueador gerencia seus bloqueios
-- ============================================================
CREATE POLICY "Users can view own blocks" ON blocks
  FOR SELECT USING (auth.uid() = blocker_id);

CREATE POLICY "Users can insert blocks" ON blocks
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can delete own blocks" ON blocks
  FOR DELETE USING (auth.uid() = blocker_id);

-- ============================================================
-- NOTIFICATIONS - dono lê/atualiza
-- ============================================================
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- PREMIUM SUBSCRIPTIONS - dono lê
-- ============================================================
CREATE POLICY "Users can view own subscription" ON premium_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- FAVORITE LINES - dono gerencia
-- ============================================================
CREATE POLICY "Users can view own favorites" ON favorite_lines
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" ON favorite_lines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" ON favorite_lines
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- TABELAS PÚBLICAS (leitura para todos)
-- ============================================================
-- premium_plans, pickup_lines, stickers são públicas
-- RLS já está desabilitado por padrão para elas