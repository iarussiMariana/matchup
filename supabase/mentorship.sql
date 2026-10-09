-- Spark mentorship: additive, RPC-only, independent opt-in. No legacy data or RLS changes.
-- Apply after the existing account schema; never replay seed/reset migrations.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.mentor_profiles (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  course text NOT NULL CHECK (length(btrim(course)) BETWEEN 1 AND 80),
  semester integer NOT NULL CHECK (semester BETWEEN 1 AND 20),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 1000),
  subjects text[] NOT NULL DEFAULT '{}' CHECK (cardinality(subjects) <= 8),
  learning_subjects text[] NOT NULL DEFAULT '{}' CHECK (cardinality(learning_subjects) <= 8),
  availability text NOT NULL DEFAULT '' CHECK (length(availability) <= 160),
  format text NOT NULL CHECK (format IN ('presencial', 'online', 'hibrido')),
  photo_url text NOT NULL DEFAULT '' CHECK (length(photo_url) <= 512),
  active boolean NOT NULL DEFAULT false,
  CHECK (NOT active OR cardinality(subjects) > 0),
  CHECK (photo_url = '' OR photo_url ~ ('^https://drvqiiddgcgvmbbnwdky\.supabase\.co/storage/v1/object/public/photos/' || id::text || '/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$'))
);
-- Defaults preserve existing opt-ins; the save RPC requires institution/city for a new profile.
ALTER TABLE public.mentor_profiles
  ADD COLUMN IF NOT EXISTS institution text NOT NULL DEFAULT '' CHECK (length(institution) <= 120),
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '' CHECK (length(city) <= 100),
  ADD COLUMN IF NOT EXISTS current_subjects text[] NOT NULL DEFAULT '{}' CHECK (cardinality(current_subjects) <= 12),
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}' CHECK (cardinality(topics) <= 20),
  ADD COLUMN IF NOT EXISTS study_preference text NOT NULL DEFAULT 'ambos' CHECK (study_preference IN ('individual','grupo','ambos'));
CREATE TABLE IF NOT EXISTS public.mentor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (learner_id <> mentor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mentor_requests_open_unique
  ON public.mentor_requests(learner_id, mentor_id, lower(btrim(subject))) WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS mentor_requests_incoming ON public.mentor_requests(mentor_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS mentor_requests_outgoing ON public.mentor_requests(learner_id, created_at DESC, id);
CREATE TABLE IF NOT EXISTS public.mentor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mentor_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  client_id uuid NOT NULL,
  UNIQUE (sender_id, client_id)
);
CREATE INDEX IF NOT EXISTS mentor_messages_history ON public.mentor_messages(request_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS public.mentor_blocks (
  blocker_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS mentor_blocks_target ON public.mentor_blocks(blocked_id, blocker_id);
ALTER TABLE public.mentor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_profiles, public.mentor_requests, public.mentor_messages, public.mentor_blocks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mentor__eligible(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user AND isfinite(p.birth_date)
      AND p.birth_date <= (CURRENT_DATE - interval '18 years')::date
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now()));
$$;
CREATE OR REPLACE FUNCTION public.mentor_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.mentor__eligible(v_uid) THEN
    RAISE EXCEPTION 'Conta ativa e idade de 18 anos ou mais obrigatórias.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor__actor()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.mentor_actor();
$$;
CREATE OR REPLACE FUNCTION public.mentor__blocked(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a))
    OR EXISTS (SELECT 1 FROM public.mentor_blocks WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a));
$$;
-- Internal shared contract for collaboration RPCs; opt-out does not end existing contact.
CREATE OR REPLACE FUNCTION public.mentor_can_contact(p_peer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.uid() <> p_peer, false)
    AND public.mentor__eligible(auth.uid()) AND public.mentor__eligible(p_peer)
    AND EXISTS (SELECT 1 FROM public.mentor_profiles WHERE id=auth.uid())
    AND EXISTS (SELECT 1 FROM public.mentor_profiles WHERE id=p_peer)
    AND NOT public.mentor__blocked(auth.uid(),p_peer);
$$;
-- Every mutation locks both accounts in UUID order, including block and send.
-- Advisory transaction locks also cover first-time opt-in (no profile row yet).
CREATE OR REPLACE FUNCTION public.mentor__lock(p_a uuid, p_b uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT DISTINCT u FROM unnest(ARRAY[p_a, p_b]) u WHERE u IS NOT NULL ORDER BY u LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('spark:mentor:' || v_id::text, 0));
  END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor__profile(p public.mentor_profiles)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'course', p.course, 'semester', p.semester,
    'bio', p.bio, 'subjects', p.subjects, 'learning_subjects', p.learning_subjects,
    'availability', p.availability, 'format', p.format, 'photo_url', p.photo_url, 'active', p.active,
    'institution', p.institution, 'city', p.city, 'current_subjects', p.current_subjects,
    'topics', p.topics, 'study_preference', p.study_preference);
$$;
CREATE OR REPLACE FUNCTION public.mentor__request(p public.mentor_requests)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'learner_id', p.learner_id, 'mentor_id', p.mentor_id,
    'subject', p.subject, 'status', p.status, 'created_at', p.created_at);
$$;
CREATE OR REPLACE FUNCTION public.mentor__message(p public.mentor_messages)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'sender_id', p.sender_id, 'body', p.body,
    'created_at', p.created_at, 'client_id', p.client_id);
$$;
CREATE OR REPLACE FUNCTION public.mentor__access(p_request uuid, p_actor uuid, p_accepted boolean DEFAULT false)
RETURNS public.mentor_requests LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.mentor_requests;
BEGIN
  SELECT * INTO r FROM public.mentor_requests WHERE id = p_request;
  IF NOT FOUND OR p_actor NOT IN (r.learner_id, r.mentor_id)
    OR NOT public.mentor__eligible(r.learner_id) OR NOT public.mentor__eligible(r.mentor_id)
    OR public.mentor__blocked(r.learner_id, r.mentor_id) OR (p_accepted AND r.status <> 'accepted') THEN
    RAISE EXCEPTION 'Solicitação indisponível.' USING ERRCODE = '42501';
  END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.mentor_me()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor();
BEGIN
  RETURN (SELECT public.mentor__profile(p) FROM public.mentor_profiles p WHERE p.id = v_uid);
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_save(p_profile jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); v_key text; v_item jsonb; v_text text;
  v_limit integer; v_new boolean; v_seen text[]; v_subjects text[] := '{}'; v_learning text[] := '{}';
  v_current text[] := '{}'; v_topics text[] := '{}'; p public.mentor_profiles;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN
      ('id','name','course','semester','bio','subjects','learning_subjects','availability','format','photo_url','active',
       'institution','city','current_subjects','topics','study_preference'))
    OR NOT (p_profile ?& ARRAY['name','course','semester','bio','subjects','learning_subjects','availability','format','photo_url','active'])
    OR (p_profile ? 'id' AND (jsonb_typeof(p_profile->'id') <> 'string' OR p_profile->>'id' <> v_uid::text)) THEN
    RAISE EXCEPTION 'Campos do perfil inválidos.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mentor__lock(v_uid);
  SELECT * INTO p FROM public.mentor_profiles WHERE id=v_uid;
  v_new := NOT FOUND;
  p_profile := jsonb_build_object('institution',coalesce(p.institution,''),'city',coalesce(p.city,''),
    'current_subjects',coalesce(p.current_subjects,'{}'::text[]),'topics',coalesce(p.topics,'{}'::text[]),
    'study_preference',coalesce(p.study_preference,'ambos')) || p_profile;
  FOREACH v_key IN ARRAY ARRAY['name','course','bio','availability','format','photo_url','institution','city'] LOOP
    v_limit := CASE v_key WHEN 'bio' THEN 1000 WHEN 'availability' THEN 160 WHEN 'photo_url' THEN 512
      WHEN 'institution' THEN 120 WHEN 'city' THEN 100 ELSE 80 END;
    IF jsonb_typeof(p_profile->v_key) <> 'string' OR length(p_profile->>v_key) > v_limit
      OR ((v_key IN ('name','course') OR (v_new AND v_key IN ('institution','city')))
        AND length(regexp_replace(p_profile->>v_key,'[[:space:]]','','g')) = 0) THEN
      RAISE EXCEPTION 'Texto do perfil inválido.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_profile->'semester') <> 'number' OR (p_profile->>'semester') !~ '^[0-9]{1,2}$'
    OR (p_profile->>'semester')::integer NOT BETWEEN 1 AND 20
    OR jsonb_typeof(p_profile->'active') <> 'boolean'
    OR p_profile->>'format' NOT IN ('presencial','online','hibrido')
    OR jsonb_typeof(p_profile->'study_preference') <> 'string'
    OR p_profile->>'study_preference' NOT IN ('individual','grupo','ambos') THEN
    RAISE EXCEPTION 'Semestre, formato ou disponibilidade inválidos.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['subjects','learning_subjects','current_subjects','topics'] LOOP
    IF jsonb_typeof(p_profile->v_key) <> 'array' THEN
      RAISE EXCEPTION 'Lista de matérias inválida.' USING ERRCODE = '22023';
    END IF;
    v_limit := CASE v_key WHEN 'current_subjects' THEN 12 WHEN 'topics' THEN 20 ELSE 8 END;
    IF jsonb_array_length(p_profile->v_key) > v_limit THEN
      RAISE EXCEPTION 'Lista excede o limite de itens.' USING ERRCODE = '22023';
    END IF;
    v_seen := '{}';
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_profile->v_key) LOOP
      v_text := regexp_replace(v_item #>> '{}','^[[:space:]]+|[[:space:]]+$','','g');
      IF jsonb_typeof(v_item) <> 'string' OR length(v_text) NOT BETWEEN 1 AND 80 OR lower(v_text) = ANY(v_seen) THEN
        RAISE EXCEPTION 'Matéria vazia, repetida ou inválida.' USING ERRCODE = '22023';
      END IF;
      v_seen := array_append(v_seen, lower(v_text));
      IF v_key = 'subjects' THEN v_subjects := array_append(v_subjects, v_text);
      ELSIF v_key = 'learning_subjects' THEN v_learning := array_append(v_learning, v_text);
      ELSIF v_key = 'current_subjects' THEN v_current := array_append(v_current, v_text);
      ELSE v_topics := array_append(v_topics, v_text); END IF;
    END LOOP;
  END LOOP;
  IF ((p_profile->>'active')::boolean AND cardinality(v_subjects) = 0)
    OR (p_profile->>'photo_url' <> '' AND p_profile->>'photo_url' !~
      ('^https://drvqiiddgcgvmbbnwdky\.supabase\.co/storage/v1/object/public/photos/' || v_uid::text || '/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$')) THEN
    RAISE EXCEPTION 'Matéria de ensino ou foto própria obrigatória.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mentor_profiles(id,name,course,semester,bio,subjects,learning_subjects,availability,format,photo_url,active,
    institution,city,current_subjects,topics,study_preference)
  VALUES(v_uid,btrim(p_profile->>'name'),btrim(p_profile->>'course'),(p_profile->>'semester')::integer,
    btrim(p_profile->>'bio'),v_subjects,v_learning,btrim(p_profile->>'availability'),p_profile->>'format',
    p_profile->>'photo_url',(p_profile->>'active')::boolean,btrim(p_profile->>'institution'),btrim(p_profile->>'city'),
    v_current,v_topics,p_profile->>'study_preference')
  ON CONFLICT (id) DO UPDATE SET name=excluded.name,course=excluded.course,semester=excluded.semester,
    bio=excluded.bio,subjects=excluded.subjects,learning_subjects=excluded.learning_subjects,
    availability=excluded.availability,format=excluded.format,photo_url=excluded.photo_url,active=excluded.active,
    institution=excluded.institution,city=excluded.city,current_subjects=excluded.current_subjects,
    topics=excluded.topics,study_preference=excluded.study_preference
  RETURNING * INTO p;
  RETURN public.mentor__profile(p);
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_discover(p_subject text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); v_result jsonb;
BEGIN
  IF p_subject IS NULL OR length(p_subject) > 80 THEN
    RAISE EXCEPTION 'Matéria inválida.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(public.mentor__profile(p) ORDER BY p.id), '[]'::jsonb) INTO v_result
  FROM (SELECT p.* FROM public.mentor_profiles p WHERE p.id <> v_uid AND p.active
    AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(v_uid,p.id)
    AND (btrim(p_subject) = '' OR EXISTS (SELECT 1 FROM unnest(p.subjects) s WHERE strpos(lower(s),lower(btrim(p_subject))) > 0))
    AND NOT EXISTS (SELECT 1 FROM public.mentor_requests r WHERE r.learner_id=v_uid AND r.mentor_id=p.id AND r.status IN ('pending','accepted'))
    ORDER BY p.id LIMIT 100) p;
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_profile(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor();
BEGIN
  RETURN (SELECT public.mentor__profile(p) FROM public.mentor_profiles p WHERE p.id=p_user
    AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(v_uid,p.id)
    AND (p.id=v_uid OR p.active OR EXISTS (SELECT 1 FROM public.mentor_requests r
      WHERE (r.learner_id=v_uid AND r.mentor_id=p.id) OR (r.mentor_id=v_uid AND r.learner_id=p.id))));
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_request(p_mentor uuid, p_subject text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); v_subject text; r public.mentor_requests;
BEGIN
  IF p_mentor IS NULL OR p_mentor=v_uid OR p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Mentor ou matéria inválidos.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mentor__lock(v_uid,p_mentor);
  IF NOT EXISTS (SELECT 1 FROM public.mentor_profiles WHERE id=v_uid)
    OR NOT public.mentor__eligible(p_mentor) OR public.mentor__blocked(v_uid,p_mentor) THEN
    RAISE EXCEPTION 'Mentoria indisponível.' USING ERRCODE = '42501';
  END IF;
  SELECT s INTO v_subject FROM public.mentor_profiles p CROSS JOIN LATERAL unnest(p.subjects) s
    WHERE p.id=p_mentor AND p.active AND lower(s)=lower(btrim(p_subject)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matéria não oferecida pelo mentor.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.mentor_requests WHERE learner_id=v_uid AND mentor_id=p_mentor
    AND lower(btrim(subject))=lower(v_subject) AND status IN ('pending','accepted');
  IF NOT FOUND THEN
    INSERT INTO public.mentor_requests(learner_id,mentor_id,subject) VALUES(v_uid,p_mentor,v_subject) RETURNING * INTO r;
  END IF;
  RETURN public.mentor__request(r);
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_requests()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); v_result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(public.mentor__request(r) || jsonb_build_object('peer',public.mentor__profile(p),
    'direction',CASE WHEN r.mentor_id=v_uid THEN 'incoming' ELSE 'outgoing' END,'updated_at',r.updated_at)
    ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_result
  FROM public.mentor_requests r JOIN public.mentor_profiles p ON p.id=CASE WHEN r.mentor_id=v_uid THEN r.learner_id ELSE r.mentor_id END
  WHERE v_uid IN (r.learner_id,r.mentor_id) AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(v_uid,p.id);
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_respond(p_request uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); r public.mentor_requests; v_status text;
BEGIN
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Resposta inválida.' USING ERRCODE = '22023'; END IF;
  r := public.mentor__access(p_request,v_uid);
  PERFORM public.mentor__lock(r.learner_id,r.mentor_id);
  r := public.mentor__access(p_request,v_uid);
  IF r.mentor_id <> v_uid THEN RAISE EXCEPTION 'Somente o mentor pode responder.' USING ERRCODE = '42501'; END IF;
  v_status := CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;
  IF r.status <> 'pending' AND r.status <> v_status THEN
    RAISE EXCEPTION 'Solicitação já respondida.' USING ERRCODE = '22023';
  END IF;
  IF r.status='pending' THEN
    UPDATE public.mentor_requests SET status=v_status,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  END IF;
  RETURN public.mentor__request(r);
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_messages(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); v_result jsonb;
BEGIN
  PERFORM public.mentor__access(p_request,v_uid,true);
  SELECT coalesce(jsonb_agg(public.mentor__message(m) ORDER BY m.created_at,m.id),'[]'::jsonb) INTO v_result
  FROM (SELECT * FROM public.mentor_messages WHERE request_id=p_request ORDER BY created_at DESC,id DESC LIMIT 200) m;
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_send(p_request uuid, p_body text, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor(); r public.mentor_requests; m public.mentor_messages;
BEGIN
  p_body := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  IF p_client_id IS NULL OR p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Mensagem ou identificador inválidos.' USING ERRCODE = '22023';
  END IF;
  r := public.mentor__access(p_request,v_uid,true);
  PERFORM public.mentor__lock(r.learner_id,r.mentor_id);
  r := public.mentor__access(p_request,v_uid,true);
  SELECT * INTO m FROM public.mentor_messages WHERE sender_id=v_uid AND client_id=p_client_id;
  IF FOUND THEN
    IF m.request_id <> p_request OR m.body <> btrim(p_body) THEN
      RAISE EXCEPTION 'Identificador já usado para outra mensagem.' USING ERRCODE = '22023';
    END IF;
  ELSE
    INSERT INTO public.mentor_messages(request_id,sender_id,body,client_id)
    VALUES(p_request,v_uid,btrim(p_body),p_client_id) RETURNING * INTO m;
  END IF;
  RETURN public.mentor__message(m);
END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_block(p_user uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := public.mentor__actor();
BEGIN
  IF p_user IS NULL OR p_user=v_uid OR p_reason IS NULL OR length(p_reason) > 1000 THEN
    RAISE EXCEPTION 'Bloqueio inválido.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mentor__lock(v_uid,p_user);
  IF NOT EXISTS (SELECT 1 FROM public.mentor_profiles WHERE id=v_uid)
    OR NOT EXISTS (SELECT 1 FROM public.mentor_profiles WHERE id=p_user) THEN
    RAISE EXCEPTION 'Perfil de mentoria indisponível.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.mentor_blocks(blocker_id,blocked_id,reason) VALUES(v_uid,p_user,btrim(p_reason))
  ON CONFLICT (blocker_id,blocked_id) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mentor_actor(),public.mentor_can_contact(uuid),
  public.mentor__eligible(uuid),public.mentor__actor(),public.mentor__blocked(uuid,uuid),
  public.mentor__lock(uuid,uuid),public.mentor__profile(public.mentor_profiles),public.mentor__request(public.mentor_requests),
  public.mentor__message(public.mentor_messages),public.mentor__access(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mentor_me(),public.mentor_save(jsonb),public.mentor_discover(text),public.mentor_profile(uuid),
  public.mentor_request(uuid,text),public.mentor_requests(),public.mentor_respond(uuid,boolean),public.mentor_messages(uuid),
  public.mentor_send(uuid,text,uuid),public.mentor_block(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_me(),public.mentor_save(jsonb),public.mentor_discover(text),public.mentor_profile(uuid),
  public.mentor_request(uuid,text),public.mentor_requests(),public.mentor_respond(uuid,boolean),public.mentor_messages(uuid),
  public.mentor_send(uuid,text,uuid),public.mentor_block(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
