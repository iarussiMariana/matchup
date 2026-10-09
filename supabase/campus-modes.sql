-- Spark Campus: additive migration after mvp-fixes.sql. Never replay seeds/reset.
-- Client access is RPC-only; dating opt-in remains onboarding_complete.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.campus_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('study', 'ride')),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 80),
  origin text NOT NULL DEFAULT '' CHECK (length(origin) <= 100),
  destination text NOT NULL DEFAULT '' CHECK (length(destination) <= 100),
  meeting_point text NOT NULL DEFAULT '' CHECK (length(meeting_point) <= 160),
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  capacity integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mode = 'study' AND capacity BETWEEN 2 AND 30 AND length(btrim(subject)) > 0)
    OR (mode = 'ride' AND capacity BETWEEN 1 AND 8
      AND length(btrim(origin)) > 0 AND length(btrim(destination)) > 0))
);
CREATE TABLE IF NOT EXISTS public.campus_members (
  post_id uuid NOT NULL REFERENCES public.campus_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.campus_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.campus_posts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campus_posts_feed ON public.campus_posts(mode, starts_at, id);
CREATE INDEX IF NOT EXISTS campus_posts_owner ON public.campus_posts(owner_id);
CREATE INDEX IF NOT EXISTS campus_members_user ON public.campus_members(user_id, post_id);
CREATE INDEX IF NOT EXISTS campus_messages_history ON public.campus_messages(post_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS campus_messages_sender ON public.campus_messages(sender_id);
ALTER TABLE public.campus_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campus_posts, public.campus_members, public.campus_messages FROM PUBLIC, anon, authenticated;

-- Narrow boolean helper avoids recursive profiles RLS, without an arbitrary-user opt-in API.
CREATE OR REPLACE FUNCTION public.dating_can_view(p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles me, public.profiles target
    WHERE me.id = auth.uid() AND target.id = p_target
      AND me.onboarding_complete IS TRUE AND target.onboarding_complete IS TRUE
      AND NOT public.is_blocked_with(p_target));
$$;
REVOKE ALL ON FUNCTION public.dating_can_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dating_can_view(uuid) TO authenticated;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.dating_can_view(id));
DROP POLICY IF EXISTS "Interests are viewable by everyone" ON public.user_interests;
CREATE POLICY "Interests are viewable by everyone" ON public.user_interests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.dating_can_view(user_id));
DROP POLICY IF EXISTS "Photos are viewable by everyone" ON public.user_photos;
CREATE POLICY "Photos are viewable by everyone" ON public.user_photos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.dating_can_view(user_id));
DROP POLICY IF EXISTS "Users can insert own swipes" ON public.swipes;
CREATE POLICY "Users can insert own swipes" ON public.swipes FOR INSERT TO authenticated
  WITH CHECK (swiper_id = auth.uid() AND swiper_id <> swiped_id AND public.dating_can_view(swiped_id));

CREATE OR REPLACE FUNCTION public.campus_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_uid AND p.birth_date <= (CURRENT_DATE - interval '18 years')::date
      AND isfinite(p.birth_date) AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())) THEN
    RAISE EXCEPTION 'Acesso permitido apenas com conta ativa e idade de 18 anos ou mais.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- Fail closed for a block involving the viewer OR any pair of current participants.
-- Even an unaffected participant cannot relay a conflicted group's roster/chat.
CREATE OR REPLACE FUNCTION public.campus_visible(p_post_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH participants AS (
    SELECT owner_id AS user_id FROM public.campus_posts WHERE id = p_post_id
    UNION SELECT user_id FROM public.campus_members WHERE post_id = p_post_id
  )
  SELECT NOT EXISTS (SELECT 1 FROM participants WHERE public.is_blocked_with(user_id))
    AND NOT EXISTS (SELECT 1 FROM public.blocks b
      JOIN participants a ON a.user_id = b.blocker_id
      JOIN participants z ON z.user_id = b.blocked_id);
$$;

CREATE OR REPLACE FUNCTION public.campus_project(p public.campus_posts)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'mode', p.mode, 'owner_id', p.owner_id,
    'owner_name', (SELECT left(name, 80) FROM public.profiles WHERE id = p.owner_id),
    'title', p.title, 'description', p.description, 'subject', p.subject,
    'origin', p.origin, 'destination', p.destination, 'meeting_point', p.meeting_point,
    'starts_at', p.starts_at, 'capacity', p.capacity,
    'member_count', (SELECT count(*)::integer FROM public.campus_members WHERE post_id = p.id),
    'is_owner', p.owner_id = auth.uid(),
    'is_member', EXISTS (SELECT 1 FROM public.campus_members WHERE post_id = p.id AND user_id = auth.uid()),
    'status', p.status);
$$;

CREATE OR REPLACE FUNCTION public.campus_list(p_mode text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); v_result jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('study', 'ride') THEN
    RAISE EXCEPTION 'Modo inválido. Escolha estudos ou carona.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(public.campus_project(q) ORDER BY q.starts_at, q.id), '[]'::jsonb)
  INTO v_result FROM (
    SELECT p.* FROM public.campus_posts p WHERE p.mode = p_mode
      AND public.campus_visible(p.id)
      AND ((p.status = 'open' AND p.starts_at > now()) OR p.owner_id = v_uid
        OR EXISTS (SELECT 1 FROM public.campus_members m WHERE m.post_id = p.id AND m.user_id = v_uid))
    ORDER BY p.starts_at, p.id LIMIT 100
  ) q;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_detail(p_post_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); p public.campus_posts; v_participant boolean;
  v_members jsonb := '[]'; v_messages jsonb := '[]';
BEGIN
  SELECT * INTO p FROM public.campus_posts WHERE id = p_post_id;
  IF NOT FOUND OR NOT public.campus_visible(p_post_id) THEN
    RAISE EXCEPTION 'Publicação indisponível.' USING ERRCODE = '42501';
  END IF;
  v_participant := p.owner_id = v_uid OR EXISTS (
    SELECT 1 FROM public.campus_members WHERE post_id = p.id AND user_id = v_uid);
  IF NOT v_participant AND (p.status <> 'open' OR p.starts_at <= now()) THEN
    RAISE EXCEPTION 'Publicação indisponível.' USING ERRCODE = '42501';
  END IF;
  IF v_participant THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', pr.id, 'name', left(pr.name, 80)) ORDER BY pr.id), '[]'::jsonb)
      INTO v_members FROM public.profiles pr WHERE pr.id IN (
        SELECT user_id FROM public.campus_members WHERE post_id = p.id
        UNION SELECT p.owner_id);
    IF p.status = 'open' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'sender_id', q.sender_id,
        'sender_name', left(pr.name, 80), 'content', q.content, 'created_at', q.created_at)
        ORDER BY q.created_at, q.id), '[]'::jsonb) INTO v_messages
      FROM (SELECT m.* FROM public.campus_messages m WHERE m.post_id = p.id
        AND NOT public.is_blocked_with(m.sender_id)
        ORDER BY m.created_at DESC, m.id DESC LIMIT 100) q
      JOIN public.profiles pr ON pr.id = q.sender_id;
    END IF;
  END IF;
  RETURN public.campus_project(p) || jsonb_build_object('members', v_members, 'messages', v_messages);
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_create(p_mode text, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); v_id uuid; v_start timestamptz; v_capacity integer;
  v_key text; v_value text; v_limit integer; v_data jsonb := '{}'::jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('study', 'ride') THEN
    RAISE EXCEPTION 'Modo inválido. Escolha estudos ou carona.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Dados da publicação inválidos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN
    ('title', 'description', 'subject', 'origin', 'destination', 'meeting_point', 'starts_at', 'capacity')) THEN
    RAISE EXCEPTION 'Campo da publicação inválido.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['title', 'description', 'subject', 'origin', 'destination', 'meeting_point'] LOOP
    IF p_data ? v_key AND jsonb_typeof(p_data->v_key) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Os campos de texto devem conter texto.' USING ERRCODE = '22023';
    END IF;
    v_value := btrim(coalesce(p_data->>v_key, ''));
    v_limit := CASE v_key WHEN 'title' THEN 80 WHEN 'description' THEN 1000 WHEN 'subject' THEN 80
      WHEN 'meeting_point' THEN 160 ELSE 100 END;
    IF length(v_value) > v_limit THEN
      RAISE EXCEPTION 'Texto acima do limite permitido.' USING ERRCODE = '22023';
    END IF;
    v_data := v_data || jsonb_build_object(v_key, v_value);
  END LOOP;
  IF length(v_data->>'title') < 3 OR (p_mode = 'study' AND v_data->>'subject' = '')
    OR (p_mode = 'ride' AND (v_data->>'origin' = '' OR v_data->>'destination' = '')) THEN
    RAISE EXCEPTION 'Preencha o título e os campos obrigatórios do modo escolhido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_data->'capacity') IS DISTINCT FROM 'number'
    OR (p_data->>'capacity') !~ '^[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'Capacidade inválida.' USING ERRCODE = '22023';
  END IF;
  v_capacity := (p_data->>'capacity')::integer;
  IF (p_mode = 'study' AND v_capacity NOT BETWEEN 2 AND 30)
    OR (p_mode = 'ride' AND v_capacity NOT BETWEEN 1 AND 8) THEN
    RAISE EXCEPTION 'Capacidade inválida.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_data->'starts_at') IS DISTINCT FROM 'string'
    OR length(p_data->>'starts_at') > 40
    OR (p_data->>'starts_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'Informe data e horário válidos com fuso horário.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_start := (p_data->>'starts_at')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_time_zone_displacement_value THEN
    RAISE EXCEPTION 'Data e horário inválidos.' USING ERRCODE = '22023';
  END;
  IF NOT isfinite(v_start) OR v_start <= now() THEN
    RAISE EXCEPTION 'Escolha uma data e horário no futuro.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.campus_posts(mode, owner_id, title, description, subject, origin, destination, meeting_point, starts_at, capacity)
    VALUES (p_mode, v_uid, v_data->>'title', v_data->>'description', v_data->>'subject', v_data->>'origin',
      v_data->>'destination', v_data->>'meeting_point', v_start, v_capacity) RETURNING id INTO v_id;
  IF p_mode = 'study' THEN
    INSERT INTO public.campus_members(post_id, user_id) VALUES (v_id, v_uid);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_join(p_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); p public.campus_posts;
BEGIN
  SELECT * INTO p FROM public.campus_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR NOT public.campus_visible(p_post_id) THEN
    RAISE EXCEPTION 'Publicação indisponível.' USING ERRCODE = '42501';
  END IF;
  IF p.status <> 'open' OR p.starts_at <= now() THEN
    RAISE EXCEPTION 'Esta publicação não aceita novas participações.' USING ERRCODE = '22023';
  END IF;
  IF p.owner_id = v_uid OR EXISTS (SELECT 1 FROM public.campus_members WHERE post_id = p.id AND user_id = v_uid) THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.campus_members WHERE post_id = p.id) >= p.capacity THEN
    RAISE EXCEPTION 'Não há vagas disponíveis.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.campus_members(post_id, user_id) VALUES (p.id, v_uid) ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_leave(p_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); p public.campus_posts;
BEGIN
  SELECT * INTO p FROM public.campus_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Publicação indisponível.' USING ERRCODE = '42501'; END IF;
  IF p.owner_id = v_uid THEN
    RAISE EXCEPTION 'O organizador deve cancelar a publicação em vez de sair.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.campus_members WHERE post_id = p.id AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_cancel(p_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); p public.campus_posts;
BEGIN
  SELECT * INTO p FROM public.campus_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR p.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Somente o organizador pode cancelar esta publicação.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.campus_posts SET status = 'cancelled' WHERE id = p.id AND status = 'open';
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_send(p_post_id uuid, p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.campus_actor(); p public.campus_posts; v_id uuid;
BEGIN
  -- Same row lock serializes membership changes, cancellation and chat authorization.
  SELECT * INTO p FROM public.campus_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR NOT public.campus_visible(p_post_id) OR p.status <> 'open'
    OR (p.owner_id <> v_uid AND NOT EXISTS (
      SELECT 1 FROM public.campus_members WHERE post_id = p.id AND user_id = v_uid)) THEN
    RAISE EXCEPTION 'Conversa indisponível. É necessário participar de uma publicação aberta.' USING ERRCODE = '42501';
  END IF;
  IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'A mensagem deve conter entre 1 e 2000 caracteres.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.campus_messages(post_id, sender_id, content) VALUES (p.id, v_uid, btrim(p_content)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.campus_actor(), public.campus_visible(uuid), public.campus_project(public.campus_posts)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campus_list(text), public.campus_detail(uuid), public.campus_create(text, jsonb),
  public.campus_join(uuid), public.campus_leave(uuid), public.campus_cancel(uuid), public.campus_send(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campus_list(text), public.campus_detail(uuid), public.campus_create(text, jsonb),
  public.campus_join(uuid), public.campus_leave(uuid), public.campus_cancel(uuid), public.campus_send(uuid, text)
  TO authenticated;
COMMENT ON TABLE public.campus_posts IS 'Estudos/carona isolados do namoro; acesso cliente somente pelas RPCs campus_*.';
COMMENT ON COLUMN public.campus_posts.meeting_point IS 'Local público/geral. A interface deve orientar a não informar endereço residencial.';
NOTIFY pgrst, 'reload schema';
COMMIT;
