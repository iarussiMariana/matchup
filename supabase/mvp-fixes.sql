-- Spark MVP corrections. New installs: migration.sql -> rls-policies.sql -> this file.
-- Existing installs: apply this file only; it is transactional and safe to rerun.
-- No user rows are removed. Test: node tests/backend-smoke.js
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  birthday DATE;
BEGIN
  BEGIN
    birthday := NULLIF(NEW.raw_user_meta_data->>'birth_date', '')::DATE;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    birthday := NULL;
  END;
  INSERT INTO public.profiles (id, name, birth_date, age)
  VALUES (NEW.id, COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''), 'Usuário'),
    birthday, EXTRACT(YEAR FROM age(CURRENT_DATE, birthday))::INTEGER)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_filters (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- The helper checks both directions without exposing another user's private block list.
CREATE OR REPLACE FUNCTION public.is_blocked_with(other_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = other_user)
       OR (b.blocker_id = other_user AND b.blocked_id = auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.is_blocked_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_match_on_swipe()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  reciprocal_direction TEXT;
  new_match_id UUID;
  smaller_id UUID := LEAST(NEW.swiper_id, NEW.swiped_id);
  larger_id UUID := GREATEST(NEW.swiper_id, NEW.swiped_id);
BEGIN
  IF NEW.direction = 'nope' OR NEW.swiper_id = NEW.swiped_id THEN RETURN NEW; END IF;
  -- Serialize reciprocal swipes so simultaneous likes cannot miss each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(smaller_id::TEXT || larger_id::TEXT, 0));
  IF EXISTS (SELECT 1 FROM public.blocks
    WHERE (blocker_id = smaller_id AND blocked_id = larger_id)
       OR (blocker_id = larger_id AND blocked_id = smaller_id)) THEN RETURN NEW; END IF;

  SELECT direction INTO reciprocal_direction FROM public.swipes
    WHERE swiper_id = NEW.swiped_id AND swiped_id = NEW.swiper_id
      AND direction IN ('like', 'super');
  IF FOUND THEN
    -- Preserve historical reversed pairs rather than creating duplicate conversations.
    IF NOT EXISTS (SELECT 1 FROM public.matches
      WHERE (user1_id = smaller_id AND user2_id = larger_id)
         OR (user1_id = larger_id AND user2_id = smaller_id)) THEN
      INSERT INTO public.matches (user1_id, user2_id, is_super)
      VALUES (smaller_id, larger_id, NEW.direction = 'super' OR reciprocal_direction = 'super')
      ON CONFLICT (user1_id, user2_id) DO NOTHING RETURNING id INTO new_match_id;
      IF new_match_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, related_user_id) VALUES
          (NEW.swiper_id, 'match', '💖 Novo match!', 'Vocês se curtiram! Comece a conversar.', NEW.swiped_id),
          (NEW.swiped_id, 'match', '💖 Novo match!', 'Vocês se curtiram! Comece a conversar.', NEW.swiper_id);
      END IF;
    END IF;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id)
    VALUES (NEW.swiped_id, CASE WHEN NEW.direction = 'super' THEN 'super_like' ELSE 'like' END,
      CASE WHEN NEW.direction = 'super' THEN '⭐ Super Like!' ELSE '💗 Alguém curtiu você!' END,
      'Veja quem te curtiu', NEW.swiper_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_check_match ON public.swipes;
CREATE TRIGGER trigger_check_match AFTER INSERT ON public.swipes
  FOR EACH ROW EXECUTE FUNCTION public.check_match_on_swipe();

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  receiver_id UUID;
BEGIN
  SELECT CASE WHEN m.user1_id = NEW.sender_id THEN m.user2_id ELSE m.user1_id END
    INTO receiver_id FROM public.matches m WHERE m.id = NEW.match_id
    AND NEW.sender_id IN (m.user1_id, m.user2_id) AND m.active;
  IF receiver_id IS NULL THEN
    RAISE EXCEPTION 'Messages require an active mutual match' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, related_user_id)
  VALUES (receiver_id, 'message', '💬 Nova mensagem', NEW.content, NEW.sender_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_blocked_matches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.matches SET active = false
  WHERE active AND ((user1_id = NEW.blocker_id AND user2_id = NEW.blocked_id)
    OR (user1_id = NEW.blocked_id AND user2_id = NEW.blocker_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_block_matches ON public.blocks;
CREATE TRIGGER trigger_block_matches AFTER INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.deactivate_blocked_matches();
UPDATE public.matches m SET active = false WHERE m.active AND EXISTS (
  SELECT 1 FROM public.blocks b
  WHERE (b.blocker_id = m.user1_id AND b.blocked_id = m.user2_id)
     OR (b.blocker_id = m.user2_id AND b.blocked_id = m.user1_id));

CREATE OR REPLACE FUNCTION public.protect_profile_entitlements()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF (TG_OP = 'INSERT' AND (COALESCE(NEW.verified, false) OR COALESCE(NEW.is_premium, false)))
      OR (TG_OP = 'UPDATE' AND (NEW.verified IS DISTINCT FROM OLD.verified
        OR NEW.is_premium IS DISTINCT FROM OLD.is_premium)) THEN
      RAISE EXCEPTION 'Profile entitlements are managed by the server' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_profile_entitlements ON public.profiles;
CREATE TRIGGER trigger_profile_entitlements BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_entitlements();

-- Replace known permissive legacy policies, including live-only setup overrides.
DROP POLICY IF EXISTS "Users and trigger can insert profile" ON public.profiles;
DROP POLICY IF EXISTS "Users and trigger can insert filters" ON public.user_filters;
DROP POLICY IF EXISTS "Users and trigger can insert interests" ON public.user_interests;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND NOT COALESCE(verified, false) AND NOT COALESCE(is_premium, false));
DROP POLICY IF EXISTS "Users can insert own filters" ON public.user_filters;
CREATE POLICY "Users can insert own filters" ON public.user_filters FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own interests" ON public.user_interests;
CREATE POLICY "Users can insert own interests" ON public.user_interests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR NOT public.is_blocked_with(id));
DROP POLICY IF EXISTS "Interests are viewable by everyone" ON public.user_interests;
CREATE POLICY "Interests are viewable by everyone" ON public.user_interests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR NOT public.is_blocked_with(user_id));
DROP POLICY IF EXISTS "Photos are viewable by everyone" ON public.user_photos;
CREATE POLICY "Photos are viewable by everyone" ON public.user_photos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR NOT public.is_blocked_with(user_id));

DROP POLICY IF EXISTS "Users can view own swipes" ON public.swipes;
CREATE POLICY "Users can view own swipes" ON public.swipes FOR SELECT TO authenticated USING (
  (swiper_id = auth.uid() AND NOT public.is_blocked_with(swiped_id)) OR
  (swiped_id = auth.uid() AND direction IN ('like', 'super') AND NOT public.is_blocked_with(swiper_id)));
DROP POLICY IF EXISTS "Users can insert own swipes" ON public.swipes;
CREATE POLICY "Users can insert own swipes" ON public.swipes FOR INSERT TO authenticated
  WITH CHECK (swiper_id = auth.uid() AND swiper_id <> swiped_id AND NOT public.is_blocked_with(swiped_id));
DROP POLICY IF EXISTS "Users can delete own swipes" ON public.swipes;
CREATE POLICY "Users can delete own swipes" ON public.swipes FOR DELETE TO authenticated
  USING (swiper_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert matches they belong to" ON public.matches;
DROP POLICY IF EXISTS "Users can view their matches" ON public.matches;
CREATE POLICY "Users can view their matches" ON public.matches FOR SELECT TO authenticated USING (
  (user1_id = auth.uid() AND NOT public.is_blocked_with(user2_id)) OR
  (user2_id = auth.uid() AND NOT public.is_blocked_with(user1_id)));
DROP POLICY IF EXISTS "Users can update their matches" ON public.matches;
CREATE POLICY "Users can update their matches" ON public.matches FOR UPDATE TO authenticated
  USING (auth.uid() IN (user1_id, user2_id)) WITH CHECK (auth.uid() IN (user1_id, user2_id) AND active = false);
REVOKE INSERT, UPDATE ON public.matches FROM anon, authenticated;
GRANT UPDATE (active) ON public.matches TO authenticated;

DROP POLICY IF EXISTS "Users can insert messages in their matches" ON public.messages;
CREATE POLICY "Users can insert messages in their matches" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND length(btrim(content)) BETWEEN 1 AND 4000
    AND EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND m.active
      AND auth.uid() IN (m.user1_id, m.user2_id)));
DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.messages;
CREATE POLICY "Recipients can mark messages read" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id <> auth.uid() AND EXISTS (SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.active AND auth.uid() IN (m.user1_id, m.user2_id)))
  WITH CHECK (read = true AND sender_id <> auth.uid() AND EXISTS (SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.active AND auth.uid() IN (m.user1_id, m.user2_id)));
REVOKE UPDATE ON public.messages, public.notifications FROM anon, authenticated;
GRANT UPDATE (read) ON public.messages, public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users can insert reports" ON public.reports;
CREATE POLICY "Users can insert reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND reporter_id <> reported_id AND status = 'pending'
    AND length(btrim(reason)) BETWEEN 1 AND 200 AND length(details) <= 4000);
DROP POLICY IF EXISTS "Users can insert blocks" ON public.blocks;
CREATE POLICY "Users can insert blocks" ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND blocker_id <> blocked_id);

-- RLS does not govern TRUNCATE. Public catalog tables must also be read-only.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles, public.user_interests,
  public.user_photos, public.user_filters, public.swipes, public.matches, public.messages,
  public.reports, public.blocks, public.notifications, public.premium_subscriptions,
  public.favorite_lines FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.premium_plans,
  public.pickup_lines, public.stickers FROM anon, authenticated;

-- A user's uploads must live under their auth UUID; public photo reads are intentional.
DROP POLICY IF EXISTS allow_authenticated_insert ON storage.objects;
CREATE POLICY allow_authenticated_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
DROP POLICY IF EXISTS "Users can delete own photo objects" ON storage.objects;
CREATE POLICY "Users can delete own photo objects" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

NOTIFY pgrst, 'reload schema';
COMMIT;
