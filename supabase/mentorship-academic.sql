-- Academic collaboration addon. Requires the complete mentorship.sql migration first.
-- No seed data. All application tables are RPC-only; private Storage has scoped policies.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.mentor_study_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100), subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
 topic text NOT NULL CHECK(length(topic)<=160), objective text NOT NULL CHECK(length(objective)<=1000),
 capacity integer NOT NULL CHECK(capacity BETWEEN 2 AND 30), starts_at timestamptz CHECK(isfinite(starts_at)),
 needs_mentor boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.mentor_group_members (
 group_id uuid REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE, user_id uuid REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 joined_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.mentor_group_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 client_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(sender_id,client_id)
);
CREATE INDEX IF NOT EXISTS mentor_group_messages_history ON public.mentor_group_messages(group_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.mentor_group_invitations (
 group_id uuid REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE, user_id uuid REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.mentor_study_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES public.mentor_requests(id) ON DELETE CASCADE,
 group_id uuid REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE, created_by uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100), subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 80),
 topic text NOT NULL CHECK(length(topic)<=160), starts_at timestamptz NOT NULL CHECK(isfinite(starts_at)),
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 240), location text NOT NULL CHECK(length(location)<=200),
 format text NOT NULL CHECK(format IN ('presencial','online','hibrido')), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((request_id IS NOT NULL)::integer + (group_id IS NOT NULL)::integer = 1)
);
CREATE TABLE IF NOT EXISTS public.mentor_session_participants (
 session_id uuid REFERENCES public.mentor_study_sessions(id) ON DELETE CASCADE, user_id uuid REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 response text NOT NULL DEFAULT 'pending' CHECK(response IN ('pending','confirmed','declined')), PRIMARY KEY(session_id,user_id)
);
CREATE INDEX IF NOT EXISTS mentor_session_participants_user ON public.mentor_session_participants(user_id,session_id);
CREATE TABLE IF NOT EXISTS public.mentor_materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES public.mentor_requests(id) ON DELETE CASCADE,
 group_id uuid REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE, owner_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180), mime text NOT NULL, size bigint NOT NULL CHECK(size BETWEEN 1 AND 10485760),
 path text NOT NULL UNIQUE, committed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((request_id IS NOT NULL)::integer + (group_id IS NOT NULL)::integer = 1)
);
CREATE INDEX IF NOT EXISTS mentor_materials_request ON public.mentor_materials(request_id);
CREATE INDEX IF NOT EXISTS mentor_materials_group ON public.mentor_materials(group_id);
CREATE TABLE IF NOT EXISTS public.mentor_session_reviews (
 session_id uuid REFERENCES public.mentor_study_sessions(id) ON DELETE CASCADE, reviewer_id uuid REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE, rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment text NOT NULL CHECK(length(comment)<=1000), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,reviewer_id), CHECK(reviewer_id<>recipient_id)
);
CREATE TABLE IF NOT EXISTS public.mentor_notification_reads (
 user_id uuid REFERENCES public.mentor_profiles(id) ON DELETE CASCADE, notification_id text CHECK(length(notification_id) BETWEEN 1 AND 200),
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(user_id,notification_id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mentor_study_groups','mentor_group_members','mentor_group_messages','mentor_group_invitations','mentor_study_sessions','mentor_session_participants','mentor_materials','mentor_session_reviews','mentor_notification_reads'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mentor_ac__actor() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_actor(); BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=u) THEN RAISE EXCEPTION 'Perfil acadêmico obrigatório.' USING ERRCODE='42501'; END IF;
 RETURN u;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_ac__text(j jsonb,k text,n integer,required boolean DEFAULT false) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s text; BEGIN
 IF j ? k AND jsonb_typeof(j->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Texto inválido: %',k USING ERRCODE='22023'; END IF;
 s:=regexp_replace(coalesce(j->>k,''),'^[[:space:]]+|[[:space:]]+$','','g');
 IF length(coalesce(j->>k,''))>n OR (required AND s='') THEN RAISE EXCEPTION 'Texto inválido: %',k USING ERRCODE='22023'; END IF;
 RETURN s;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_ac__date(j jsonb,k text,required boolean DEFAULT false) RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d timestamptz; BEGIN
 IF NOT (j ? k) OR j->k='null'::jsonb THEN
  IF required THEN RAISE EXCEPTION 'Horário obrigatório.' USING ERRCODE='22023'; END IF;
  RETURN NULL;
 END IF;
 IF jsonb_typeof(j->k)<>'string' OR length(j->>k)>60 THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='22023'; END IF;
 BEGIN d:=(j->>k)::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='22023'; END;
 IF NOT isfinite(d) OR d<=clock_timestamp() THEN RAISE EXCEPTION 'Escolha um horário futuro.' USING ERRCODE='22023'; END IF;
 RETURN d;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_ac__uuid(j jsonb,k text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT(j ? k) OR j->k='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(j->k)<>'string' OR j->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Identificador inválido.' USING ERRCODE='22023'; END IF;
 RETURN (j->>k)::uuid;
END $$;
-- Serialize a group's membership/capacity first, then use the same ordered account locks as core.
CREATE OR REPLACE FUNCTION public.mentor_ac__group_lock(g uuid,extra uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('spark:mentor:group:'||g::text,0));
 FOR u IN SELECT DISTINCT id FROM (SELECT user_id id FROM public.mentor_group_members WHERE group_id=g UNION SELECT owner_id FROM public.mentor_study_groups WHERE id=g UNION SELECT auth.uid() UNION SELECT extra) q WHERE id IS NOT NULL ORDER BY id LOOP
  PERFORM public.mentor__lock(u);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_ac__group_visible(g uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.mentor__eligible(u) AND EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=u)
 AND EXISTS(SELECT 1 FROM public.mentor_study_groups x WHERE x.id=g AND public.mentor__eligible(x.owner_id)
   AND NOT public.mentor__blocked(u,x.owner_id)
   AND (x.status='open' OR EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=g AND user_id=u)))
 AND NOT EXISTS(SELECT 1 FROM public.mentor_group_members m WHERE m.group_id=g AND public.mentor__blocked(u,m.user_id));
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__group_access(g uuid,u uuid,allow_cancelled boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.mentor_ac__group_visible(g,u) AND EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=g AND user_id=u)
 AND EXISTS(SELECT 1 FROM public.mentor_study_groups WHERE id=g AND (status='open' OR allow_cancelled));
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__context(r uuid,g uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.mentor__eligible(u) AND EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=u) AND CASE
 WHEN r IS NOT NULL AND g IS NULL THEN EXISTS(SELECT 1 FROM public.mentor_requests x WHERE x.id=r AND x.status='accepted' AND u IN(x.learner_id,x.mentor_id) AND public.mentor__eligible(x.learner_id) AND public.mentor__eligible(x.mentor_id) AND NOT public.mentor__blocked(x.learner_id,x.mentor_id))
 WHEN g IS NOT NULL AND r IS NULL THEN public.mentor_ac__group_access(g,u) ELSE false END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__context_lock(r uuid,g uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.mentor_requests; BEGIN
 IF g IS NOT NULL THEN PERFORM public.mentor_ac__group_lock(g);
 ELSE SELECT * INTO x FROM public.mentor_requests WHERE id=r; PERFORM public.mentor__lock(x.learner_id,x.mentor_id); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_ac__group(g public.mentor_study_groups,u uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',g.id,'name',g.name,'subject',g.subject,'topic',g.topic,'objective',g.objective,'capacity',g.capacity,'starts_at',g.starts_at,'needs_mentor',g.needs_mentor,'owner_id',g.owner_id,'status',g.status,
 'member_count',(SELECT count(*) FROM public.mentor_group_members WHERE group_id=g.id),
 'is_member',EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=g.id AND user_id=u),'is_owner',g.owner_id=u);
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__group_message(m public.mentor_group_messages) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',(SELECT name FROM public.mentor_profiles WHERE id=m.sender_id),'body',m.body,'created_at',m.created_at,'client_id',m.client_id);
$$;
CREATE OR REPLACE FUNCTION public.mentor_groups() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 RETURN coalesce((SELECT jsonb_agg(public.mentor_ac__group(q,u) ORDER BY q.created_at DESC,q.id) FROM
 (SELECT g.* FROM public.mentor_study_groups g WHERE public.mentor_ac__group_visible(g.id,u) ORDER BY g.created_at DESC,g.id LIMIT 100) q),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_create(p_group jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 IF jsonb_typeof(p_group) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_group) k WHERE k NOT IN('name','subject','topic','objective','capacity','starts_at','needs_mentor')) THEN RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_group->'capacity') IS DISTINCT FROM 'number' OR (p_group->>'capacity') !~ '^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Capacidade inválida.' USING ERRCODE='22023'; END IF;
 IF (p_group->>'capacity')::integer NOT BETWEEN 2 AND 30 OR (p_group ? 'needs_mentor' AND jsonb_typeof(p_group->'needs_mentor') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor__lock(u); PERFORM public.mentor_ac__actor();
 INSERT INTO public.mentor_study_groups(owner_id,name,subject,topic,objective,capacity,starts_at,needs_mentor)
 VALUES(u,public.mentor_ac__text(p_group,'name',100,true),public.mentor_ac__text(p_group,'subject',80,true),public.mentor_ac__text(p_group,'topic',160),public.mentor_ac__text(p_group,'objective',1000),(p_group->>'capacity')::integer,public.mentor_ac__date(p_group,'starts_at'),coalesce((p_group->>'needs_mentor')::boolean,false)) RETURNING * INTO g;
 INSERT INTO public.mentor_group_members(group_id,user_id) VALUES(g.id,u);
 RETURN public.mentor_ac__group(g,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_detail(p_group uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; members jsonb:='[]'; messages jsonb:='[]'; BEGIN
 IF NOT public.mentor_ac__group_visible(p_group,u) THEN RAISE EXCEPTION 'Grupo indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group;
 IF public.mentor_ac__group_access(p_group,u) THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'course',p.course,'subjects',p.subjects) ORDER BY m.joined_at,p.id),'[]') INTO members FROM public.mentor_group_members m JOIN public.mentor_profiles p ON p.id=m.user_id WHERE m.group_id=p_group AND public.mentor__eligible(p.id);
  SELECT coalesce(jsonb_agg(public.mentor_ac__group_message(q) ORDER BY q.created_at,q.id),'[]') INTO messages FROM
   (SELECT m.* FROM public.mentor_group_messages m WHERE m.group_id=p_group AND public.mentor__eligible(m.sender_id) AND NOT public.mentor__blocked(u,m.sender_id) ORDER BY m.created_at DESC,m.id DESC LIMIT 200) q;
 END IF;
 RETURN public.mentor_ac__group(g,u)||jsonb_build_object('members',members,'messages',messages);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_join(p_group uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor();
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR NOT public.mentor_ac__group_visible(p_group,u) THEN RAISE EXCEPTION 'Grupo indisponível.' USING ERRCODE='42501'; END IF;
 IF g.status<>'open' THEN RAISE EXCEPTION 'Grupo cancelado.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=u) THEN
  IF (SELECT count(*) FROM public.mentor_group_members WHERE group_id=p_group)>=g.capacity THEN RAISE EXCEPTION 'Grupo completo.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.mentor_group_members(group_id,user_id) VALUES(p_group,u);
 END IF;
 RETURN public.mentor_ac__group(g,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_leave(p_group uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor(); SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group;
 IF NOT FOUND THEN RAISE EXCEPTION 'Grupo indisponível.' USING ERRCODE='42501'; END IF;
 IF g.owner_id=u THEN RAISE EXCEPTION 'O organizador deve cancelar o grupo.' USING ERRCODE='22023'; END IF;
 DELETE FROM public.mentor_group_members WHERE group_id=p_group AND user_id=u;
 IF NOT FOUND THEN RETURN true; END IF;
 -- A departure withdraws outstanding attendance, without rewriting completed history.
 UPDATE public.mentor_session_participants p SET response='declined' FROM public.mentor_study_sessions s WHERE s.id=p.session_id AND s.group_id=p_group AND p.user_id=u AND s.status<>'cancelled' AND s.starts_at>clock_timestamp();
 UPDATE public.mentor_study_sessions s SET status='pending',updated_at=clock_timestamp() WHERE s.group_id=p_group AND s.status<>'cancelled' AND s.starts_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.mentor_session_participants p WHERE p.session_id=s.id AND p.user_id=u);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_cancel(p_group uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor();
 IF NOT EXISTS(SELECT 1 FROM public.mentor_study_groups WHERE id=p_group AND owner_id=u) THEN RAISE EXCEPTION 'Somente o organizador pode cancelar.' USING ERRCODE='42501'; END IF;
 UPDATE public.mentor_study_groups SET status='cancelled' WHERE id=p_group AND status<>'cancelled';
 UPDATE public.mentor_study_sessions SET status='cancelled',updated_at=clock_timestamp() WHERE group_id=p_group AND status<>'cancelled' AND starts_at>clock_timestamp();
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_send(p_group uuid,p_body text,p_client_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); m public.mentor_group_messages; b text:=regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g'); BEGIN
 IF b IS NULL OR length(b) NOT BETWEEN 1 AND 2000 OR length(p_body)>2000 OR p_client_id IS NULL THEN RAISE EXCEPTION 'Mensagem inválida.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor_ac__group_lock(p_group);
 IF NOT public.mentor_ac__group_access(p_group,u) THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.mentor_group_messages WHERE sender_id=u AND client_id=p_client_id;
 IF FOUND THEN
  IF m.group_id<>p_group OR m.body<>b THEN RAISE EXCEPTION 'Reenvio incompatível.' USING ERRCODE='22023'; END IF;
 ELSE INSERT INTO public.mentor_group_messages(group_id,sender_id,body,client_id) VALUES(p_group,u,b,p_client_id) RETURNING * INTO m; END IF;
 RETURN public.mentor_ac__group_message(m);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_suggestions(p_group uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group AND owner_id=u;
 IF NOT FOUND OR NOT public.mentor_ac__group_access(p_group,u) THEN RAISE EXCEPTION 'Somente o organizador pode consultar.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'course',q.course,'subjects',q.subjects) ORDER BY q.name,q.id) FROM
 (SELECT p.* FROM public.mentor_profiles p WHERE p.id<>u AND public.mentor_can_contact(p.id) AND public.mentor_ac__group_visible(p_group,p.id)
 AND NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=p.id)
 AND EXISTS(SELECT 1 FROM unnest(p.subjects||p.learning_subjects||p.current_subjects||p.topics) s WHERE lower(btrim(s)) IN(lower(g.subject),lower(g.topic))) ORDER BY p.name,p.id LIMIT 20) q),'[]');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_invite(p_group uuid,p_user uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 PERFORM public.mentor_ac__group_lock(p_group,p_user);
 IF NOT EXISTS(SELECT 1 FROM public.mentor_study_groups WHERE id=p_group AND owner_id=u) OR NOT public.mentor_ac__group_access(p_group,u) OR NOT public.mentor_can_contact(p_user) OR NOT public.mentor_ac__group_visible(p_group,p_user) THEN RAISE EXCEPTION 'Convite indisponível.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=p_user) THEN
  INSERT INTO public.mentor_group_invitations(group_id,user_id) VALUES(p_group,p_user) ON CONFLICT DO NOTHING;
 END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mentor_ac__session_access(s public.mentor_study_sessions,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.mentor_session_participants WHERE session_id=s.id AND user_id=u)
 AND public.mentor__eligible(u) AND public.mentor__eligible(s.created_by) AND NOT public.mentor__blocked(u,s.created_by)
 AND CASE WHEN s.group_id IS NOT NULL THEN public.mentor_ac__group_access(s.group_id,u,true) ELSE public.mentor_ac__context(s.request_id,NULL,u) END
 AND NOT EXISTS(SELECT 1 FROM public.mentor_session_participants WHERE session_id=s.id AND public.mentor__blocked(u,user_id));
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__recipient(s public.mentor_study_sessions) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN s.request_id IS NOT NULL THEN (SELECT mentor_id FROM public.mentor_requests WHERE id=s.request_id) ELSE (SELECT owner_id FROM public.mentor_study_groups WHERE id=s.group_id) END;
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__can_review(s public.mentor_study_sessions,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.status='confirmed' AND s.starts_at+make_interval(mins=>s.duration_minutes)<=now()
 AND public.mentor_ac__session_access(s,u) AND public.mentor_ac__context(s.request_id,s.group_id,u)
 AND public.mentor_ac__recipient(s)<>u AND public.mentor__eligible(public.mentor_ac__recipient(s)) AND NOT public.mentor__blocked(u,public.mentor_ac__recipient(s))
 AND EXISTS(SELECT 1 FROM public.mentor_session_participants WHERE session_id=s.id AND user_id=u AND response='confirmed')
 AND NOT EXISTS(SELECT 1 FROM public.mentor_session_reviews WHERE session_id=s.id AND reviewer_id=u);
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__session(s public.mentor_study_sessions,u uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'request_id',s.request_id,'group_id',s.group_id,'title',s.title,'subject',s.subject,'topic',s.topic,'starts_at',s.starts_at,'duration_minutes',s.duration_minutes,'location',s.location,'format',s.format,'created_by',s.created_by,'status',s.status,
 'my_response',(SELECT response FROM public.mentor_session_participants WHERE session_id=s.id AND user_id=u),
 'participants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'response',x.response) ORDER BY p.name,p.id) FROM public.mentor_session_participants x JOIN public.mentor_profiles p ON p.id=x.user_id WHERE x.session_id=s.id AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(u,p.id)),'[]'),
 'is_creator',s.created_by=u,'mentor_id',public.mentor_ac__recipient(s),'can_review',public.mentor_ac__can_review(s,u));
$$;
CREATE OR REPLACE FUNCTION public.mentor_sessions() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 RETURN coalesce((SELECT jsonb_agg(public.mentor_ac__session(s,u) ORDER BY s.starts_at,s.id) FROM public.mentor_study_sessions s WHERE public.mentor_ac__session_access(s,u)),'[]');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_session_save(p_session jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); s public.mentor_study_sessions; old public.mentor_study_sessions; r public.mentor_requests; g public.mentor_study_groups; sid uuid; rid uuid; gid uuid; subj text; BEGIN
 IF jsonb_typeof(p_session) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_session) k WHERE k NOT IN('id','request_id','group_id','title','subject','topic','starts_at','duration_minutes','location','format')) THEN RAISE EXCEPTION 'Encontro inválido.' USING ERRCODE='22023'; END IF;
 sid:=public.mentor_ac__uuid(p_session,'id'); rid:=public.mentor_ac__uuid(p_session,'request_id'); gid:=public.mentor_ac__uuid(p_session,'group_id');
 IF (rid IS NULL)=(gid IS NULL) THEN RAISE EXCEPTION 'Escolha uma conexão ou grupo.' USING ERRCODE='22023'; END IF;
 IF sid IS NOT NULL THEN
  SELECT * INTO old FROM public.mentor_study_sessions WHERE id=sid;
  IF NOT FOUND OR old.created_by<>u THEN RAISE EXCEPTION 'Somente o organizador pode remarcar.' USING ERRCODE='42501'; END IF;
  IF old.request_id IS DISTINCT FROM rid OR old.group_id IS DISTINCT FROM gid THEN RAISE EXCEPTION 'O contexto não pode mudar.' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM public.mentor_ac__context_lock(rid,gid);
 IF NOT public.mentor_ac__context(rid,gid,u) THEN RAISE EXCEPTION 'Encontro indisponível.' USING ERRCODE='42501'; END IF;
 IF sid IS NOT NULL THEN
  SELECT * INTO old FROM public.mentor_study_sessions WHERE id=sid FOR UPDATE;
  IF old.status='cancelled' OR old.starts_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM public.mentor_session_reviews WHERE session_id=sid) THEN RAISE EXCEPTION 'Encontro encerrado.' USING ERRCODE='22023'; END IF;
 END IF;
 IF gid IS NOT NULL THEN
  SELECT * INTO g FROM public.mentor_study_groups WHERE id=gid;
  IF g.owner_id<>u THEN RAISE EXCEPTION 'Somente o organizador pode agendar.' USING ERRCODE='42501'; END IF; subj:=g.subject;
 ELSE SELECT * INTO r FROM public.mentor_requests WHERE id=rid; subj:=r.subject; END IF;
 IF lower(public.mentor_ac__text(p_session,'subject',80,true))<>lower(subj) THEN RAISE EXCEPTION 'Matéria diferente do contexto.' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_session->'duration_minutes') IS DISTINCT FROM 'number' OR p_session->>'duration_minutes' !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'Duração inválida.' USING ERRCODE='22023'; END IF;
 IF (p_session->>'duration_minutes')::integer NOT BETWEEN 15 AND 240 OR p_session->>'format' IS NULL OR p_session->>'format' NOT IN('presencial','online','hibrido') THEN RAISE EXCEPTION 'Duração ou formato inválido.' USING ERRCODE='22023'; END IF;
 s.id:=coalesce(sid,gen_random_uuid()); s.request_id:=rid; s.group_id:=gid; s.created_by:=u;
 s.title:=public.mentor_ac__text(p_session,'title',100,true); s.subject:=subj; s.topic:=public.mentor_ac__text(p_session,'topic',160); s.location:=public.mentor_ac__text(p_session,'location',200);
 s.starts_at:=public.mentor_ac__date(p_session,'starts_at',true); s.duration_minutes:=(p_session->>'duration_minutes')::integer; s.format:=p_session->>'format';
 IF sid IS NULL THEN
  INSERT INTO public.mentor_study_sessions(id,request_id,group_id,created_by,title,subject,topic,starts_at,duration_minutes,location,format) VALUES(s.id,rid,gid,u,s.title,subj,s.topic,s.starts_at,s.duration_minutes,s.location,s.format);
 ELSE
  UPDATE public.mentor_study_sessions SET title=s.title,topic=s.topic,starts_at=s.starts_at,duration_minutes=s.duration_minutes,location=s.location,format=s.format,status='pending',updated_at=clock_timestamp() WHERE id=sid;
  DELETE FROM public.mentor_session_participants WHERE session_id=sid;
 END IF;
 IF rid IS NOT NULL THEN INSERT INTO public.mentor_session_participants(session_id,user_id,response) SELECT s.id,x,CASE WHEN x=u THEN 'confirmed' ELSE 'pending' END FROM unnest(ARRAY[r.learner_id,r.mentor_id]) x;
 ELSE INSERT INTO public.mentor_session_participants(session_id,user_id,response) SELECT s.id,m.user_id,CASE WHEN m.user_id=u THEN 'confirmed' ELSE 'pending' END FROM public.mentor_group_members m WHERE m.group_id=gid AND public.mentor__eligible(m.user_id) AND NOT public.mentor__blocked(u,m.user_id); END IF;
 UPDATE public.mentor_study_sessions x SET status=CASE WHEN EXISTS(SELECT 1 FROM public.mentor_session_participants WHERE session_id=s.id AND response<>'confirmed') THEN 'pending' ELSE 'confirmed' END WHERE x.id=s.id RETURNING x.* INTO s;
 RETURN public.mentor_ac__session(s,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_session_respond(p_session uuid,p_accept boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); s public.mentor_study_sessions; BEGIN
 IF p_accept IS NULL THEN RAISE EXCEPTION 'Resposta inválida.' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.mentor_study_sessions WHERE id=p_session;
 PERFORM public.mentor_ac__context_lock(s.request_id,s.group_id);
 SELECT * INTO s FROM public.mentor_study_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR NOT public.mentor_ac__session_access(s,u) OR NOT public.mentor_ac__context(s.request_id,s.group_id,u) THEN RAISE EXCEPTION 'Encontro indisponível.' USING ERRCODE='42501'; END IF;
 IF s.status='cancelled' OR s.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'Encontro encerrado.' USING ERRCODE='22023'; END IF;
 UPDATE public.mentor_session_participants SET response=CASE WHEN p_accept THEN 'confirmed' ELSE 'declined' END WHERE session_id=p_session AND user_id=u;
 UPDATE public.mentor_study_sessions x SET status=CASE WHEN EXISTS(SELECT 1 FROM public.mentor_session_participants WHERE session_id=p_session AND response<>'confirmed') THEN 'pending' ELSE 'confirmed' END,updated_at=clock_timestamp() WHERE x.id=p_session RETURNING * INTO s;
 RETURN public.mentor_ac__session(s,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_session_cancel(p_session uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); s public.mentor_study_sessions; BEGIN
 SELECT * INTO s FROM public.mentor_study_sessions WHERE id=p_session;
 PERFORM public.mentor_ac__context_lock(s.request_id,s.group_id);
 SELECT * INTO s FROM public.mentor_study_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.created_by<>u OR NOT public.mentor_ac__session_access(s,u) THEN RAISE EXCEPTION 'Somente o organizador pode cancelar.' USING ERRCODE='42501'; END IF;
 IF s.status='cancelled' THEN RETURN true; END IF;
 IF s.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'Encontro encerrado.' USING ERRCODE='22023'; END IF;
 UPDATE public.mentor_study_sessions SET status='cancelled',updated_at=clock_timestamp() WHERE id=p_session;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mentor_ac__file(f public.mentor_materials) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size,'path',f.path,'bucket','mentor-materials','owner_id',f.owner_id,'created_at',f.created_at);
$$;
CREATE OR REPLACE FUNCTION public.mentor_file_prepare(p_request uuid,p_group uuid,p_name text,p_mime text,p_size bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); f public.mentor_materials; ext text; expected text; BEGIN
 IF (p_request IS NULL)=(p_group IS NULL) THEN RAISE EXCEPTION 'Contexto inválido.' USING ERRCODE='22023'; END IF;
 IF p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 180 OR p_name<>btrim(p_name) OR p_name ~ '[[:cntrl:]/\\]' OR p_name ~ '^\.' OR p_name ~ '[<>:"|?*]' THEN RAISE EXCEPTION 'Nome de arquivo inválido.' USING ERRCODE='22023'; END IF;
 ext:=lower(substring(p_name FROM '\.([A-Za-z0-9]+)$'));
 expected:=CASE ext WHEN 'pdf' THEN 'application/pdf' WHEN 'doc' THEN 'application/msword' WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' WHEN 'ppt' THEN 'application/vnd.ms-powerpoint' WHEN 'pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation' WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' WHEN 'png' THEN 'image/png' WHEN 'webp' THEN 'image/webp' END;
 IF expected IS NULL OR p_mime IS DISTINCT FROM expected OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'Tipo ou tamanho de arquivo inválido.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor_ac__context_lock(p_request,p_group);
 IF NOT public.mentor_ac__context(p_request,p_group,u) THEN RAISE EXCEPTION 'Materiais indisponíveis.' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.mentor_materials WHERE request_id=p_request OR group_id=p_group)>=50 THEN RAISE EXCEPTION 'Limite de 50 materiais atingido.' USING ERRCODE='22023'; END IF;
 f.id:=gen_random_uuid(); f.path:=u::text||'/'||f.id::text||'.'||ext;
 INSERT INTO public.mentor_materials(id,request_id,group_id,owner_id,name,mime,size,path) VALUES(f.id,p_request,p_group,u,p_name,p_mime,p_size,f.path);
 RETURN jsonb_build_object('id',f.id,'path',f.path,'bucket','mentor-materials');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_file_commit(p_file uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); f public.mentor_materials; BEGIN
 SELECT * INTO f FROM public.mentor_materials WHERE id=p_file;
 PERFORM public.mentor_ac__context_lock(f.request_id,f.group_id);
 SELECT * INTO f FROM public.mentor_materials WHERE id=p_file FOR UPDATE;
 IF NOT FOUND OR f.owner_id<>u OR NOT public.mentor_ac__context(f.request_id,f.group_id,u) THEN RAISE EXCEPTION 'Upload indisponível.' USING ERRCODE='42501'; END IF;
 IF f.committed THEN RETURN public.mentor_ac__file(f); END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='mentor-materials' AND o.name=f.path AND o.owner_id=u::text AND o.metadata->>'mimetype'=f.mime AND o.metadata->>'size'=f.size::text) THEN RAISE EXCEPTION 'Upload ausente ou metadados incompatíveis.' USING ERRCODE='22023'; END IF;
 UPDATE public.mentor_materials SET committed=true WHERE id=p_file RETURNING * INTO f;
 RETURN public.mentor_ac__file(f);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_files(p_request uuid,p_group uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 IF (p_request IS NULL)=(p_group IS NULL) THEN RAISE EXCEPTION 'Contexto inválido.' USING ERRCODE='22023'; END IF;
 IF NOT public.mentor_ac__context(p_request,p_group,u) THEN RAISE EXCEPTION 'Materiais indisponíveis.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.mentor_ac__file(f) ORDER BY f.created_at DESC,f.id) FROM public.mentor_materials f WHERE f.committed AND (f.request_id=p_request OR f.group_id=p_group) AND public.mentor_ac__context(f.request_id,f.group_id,f.owner_id) AND NOT public.mentor__blocked(u,f.owner_id)),'[]');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_file_abort(p_file uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); f public.mentor_materials; BEGIN
 SELECT * INTO f FROM public.mentor_materials WHERE id=p_file;
 PERFORM public.mentor_ac__context_lock(f.request_id,f.group_id);
 SELECT * INTO f FROM public.mentor_materials WHERE id=p_file FOR UPDATE;
 IF NOT FOUND THEN RETURN true; END IF;
 IF f.owner_id<>u OR NOT public.mentor_ac__context(f.request_id,f.group_id,u) THEN RAISE EXCEPTION 'Upload indisponível.' USING ERRCODE='42501'; END IF;
 IF f.committed OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='mentor-materials' AND name=f.path) THEN RAISE EXCEPTION 'Arquivo existente não pode ser abandonado.' USING ERRCODE='22023'; END IF;
 DELETE FROM public.mentor_materials WHERE id=p_file; RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_review(p_session uuid,p_rating integer,p_comment text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); s public.mentor_study_sessions; r public.mentor_session_reviews; BEGIN
 IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR p_comment IS NULL OR length(p_comment)>1000 THEN RAISE EXCEPTION 'Avaliação inválida.' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.mentor_study_sessions WHERE id=p_session; PERFORM public.mentor_ac__context_lock(s.request_id,s.group_id);
 SELECT * INTO s FROM public.mentor_study_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR NOT public.mentor_ac__session_access(s,u) OR NOT public.mentor_ac__context(s.request_id,s.group_id,u) THEN RAISE EXCEPTION 'Encontro indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.mentor_session_reviews WHERE session_id=p_session AND reviewer_id=u;
 IF FOUND THEN
  IF r.rating=p_rating AND r.comment=btrim(p_comment) THEN RETURN true; END IF;
  RAISE EXCEPTION 'Encontro já avaliado.' USING ERRCODE='22023';
 END IF;
 IF NOT public.mentor_ac__can_review(s,u) THEN RAISE EXCEPTION 'Avaliação disponível após encontro confirmado e concluído.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.mentor_session_reviews(session_id,reviewer_id,recipient_id,rating,comment) VALUES(p_session,u,public.mentor_ac__recipient(s),p_rating,btrim(p_comment)); RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_reviews(p_user uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); result jsonb; BEGIN
 IF public.mentor_profile(p_user) IS NULL THEN RETURN jsonb_build_object('count',0,'average',NULL,'items','[]'::jsonb); END IF;
 SELECT jsonb_build_object('count',count(*),'average',round(avg(r.rating),2),'items',coalesce(jsonb_agg(jsonb_build_object('rating',r.rating,'comment',r.comment,'reviewer_name',p.name,'created_at',r.created_at) ORDER BY r.created_at DESC,r.session_id),'[]')) INTO result
 FROM public.mentor_session_reviews r JOIN public.mentor_profiles p ON p.id=r.reviewer_id WHERE r.recipient_id=p_user AND public.mentor__eligible(r.reviewer_id) AND NOT public.mentor__blocked(u,r.reviewer_id) AND NOT public.mentor__blocked(p_user,r.reviewer_id);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mentor_notifications() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 RETURN coalesce((WITH events AS (
 SELECT 'request:'||r.id::text id,'request'::text type,'Pedido de monitoria'::text title,p.name||' quer estudar '||r.subject body,r.id request_id,NULL::uuid group_id,NULL::uuid session_id,r.created_at
 FROM public.mentor_requests r JOIN public.mentor_profiles p ON p.id=r.learner_id WHERE r.mentor_id=u AND r.status='pending' AND public.mentor_can_contact(r.learner_id)
 UNION ALL SELECT 'accepted:'||r.id,'accepted','Conexão confirmada',p.name||' · '||r.subject,r.id,NULL,NULL,r.updated_at FROM public.mentor_requests r JOIN public.mentor_profiles p ON p.id=CASE WHEN r.mentor_id=u THEN r.learner_id ELSE r.mentor_id END WHERE r.status='accepted' AND u IN(r.learner_id,r.mentor_id) AND public.mentor_ac__context(r.id,NULL,u)
 UNION ALL SELECT 'message:'||m.id,'message','Nova mensagem',p.name||': '||left(m.body,140),m.request_id,NULL,NULL,m.created_at FROM public.mentor_messages m JOIN public.mentor_profiles p ON p.id=m.sender_id WHERE m.sender_id<>u AND public.mentor_ac__context(m.request_id,NULL,u)
 UNION ALL SELECT 'invitation:'||i.group_id||':'||i.user_id,'invitation','Convite para grupo',g.name,NULL,g.id,NULL,i.created_at FROM public.mentor_group_invitations i JOIN public.mentor_study_groups g ON g.id=i.group_id WHERE i.user_id=u AND g.status='open' AND public.mentor_ac__group_visible(g.id,u) AND NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=g.id AND user_id=u)
 UNION ALL SELECT 'group-message:'||m.id,'group_message','Mensagem no grupo',p.name||': '||left(m.body,140),NULL,m.group_id,NULL,m.created_at FROM public.mentor_group_messages m JOIN public.mentor_profiles p ON p.id=m.sender_id WHERE m.sender_id<>u AND public.mentor__eligible(m.sender_id) AND NOT public.mentor__blocked(u,m.sender_id) AND public.mentor_ac__group_access(m.group_id,u)
 UNION ALL SELECT 'file:'||f.id,'file','Novo material',f.name,f.request_id,f.group_id,NULL,f.created_at FROM public.mentor_materials f WHERE f.committed AND f.owner_id<>u AND public.mentor_ac__context(f.request_id,f.group_id,u) AND public.mentor_ac__context(f.request_id,f.group_id,f.owner_id) AND NOT public.mentor__blocked(u,f.owner_id)
 UNION ALL SELECT 'session:'||s.id||':'||extract(epoch FROM s.updated_at)::text,'session',CASE WHEN s.status='cancelled' THEN 'Encontro cancelado' ELSE 'Encontro atualizado' END,s.title,s.request_id,s.group_id,s.id,s.updated_at FROM public.mentor_study_sessions s WHERE public.mentor_ac__session_access(s,u)
 UNION ALL SELECT 'upcoming:'||s.id||':'||extract(epoch FROM s.updated_at)::text,'upcoming','Encontro nas próximas 24 horas',s.title,s.request_id,s.group_id,s.id,s.updated_at FROM public.mentor_study_sessions s WHERE s.status<>'cancelled' AND s.starts_at>now() AND s.starts_at<=now()+interval '24 hours' AND public.mentor_ac__session_access(s,u)
 ), limited AS (SELECT * FROM events ORDER BY created_at DESC,id LIMIT 100)
 SELECT jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'title',e.title,'body',e.body,'request_id',e.request_id,'group_id',e.group_id,'session_id',e.session_id,'created_at',e.created_at,'is_read',EXISTS(SELECT 1 FROM public.mentor_notification_reads WHERE user_id=u AND notification_id=e.id)) ORDER BY e.created_at DESC,e.id) FROM limited e),'[]');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_notification_read(p_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 IF p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Notificação inválida.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.mentor_notifications()) n WHERE n->>'id'=p_id) THEN RAISE EXCEPTION 'Notificação indisponível.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.mentor_notification_reads(user_id,notification_id) VALUES(u,p_id) ON CONFLICT DO NOTHING; RETURN true;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('mentor-materials','mentor-materials',false,10485760,
 ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- A security-barrier, owner-rights view exposes only paths the caller can use. It avoids
-- granting EXECUTE on any internal SECURITY DEFINER helper to Storage/API roles.
-- It intentionally expands the eligibility/block predicates; ordinary views do not
-- execute called functions as their owner. The mentor_private schema is not a public RPC API.
CREATE SCHEMA IF NOT EXISTS mentor_private;
REVOKE ALL ON SCHEMA mentor_private FROM PUBLIC;
GRANT USAGE ON SCHEMA mentor_private TO authenticated,anon;
CREATE OR REPLACE VIEW mentor_private.mentor_material_permissions WITH(security_barrier=true) AS
 WITH eligible AS (
  SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id JOIN public.mentor_profiles m ON m.id=p.id
  WHERE isfinite(p.birth_date) AND p.birth_date<=(CURRENT_DATE-interval '18 years')::date AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
 ), blocked AS (SELECT blocker_id a,blocked_id b FROM public.blocks UNION ALL SELECT blocker_id,blocked_id FROM public.mentor_blocks),
 contexts AS (
  SELECT f.* FROM public.mentor_materials f
  WHERE EXISTS(SELECT 1 FROM eligible WHERE id=auth.uid()) AND EXISTS(SELECT 1 FROM eligible WHERE id=f.owner_id)
  AND NOT EXISTS(SELECT 1 FROM blocked WHERE (a=auth.uid() AND b=f.owner_id) OR (b=auth.uid() AND a=f.owner_id))
  AND ((f.request_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.mentor_requests r WHERE r.id=f.request_id AND r.status='accepted' AND auth.uid() IN(r.learner_id,r.mentor_id) AND f.owner_id IN(r.learner_id,r.mentor_id)
   AND EXISTS(SELECT 1 FROM eligible WHERE id=r.learner_id) AND EXISTS(SELECT 1 FROM eligible WHERE id=r.mentor_id)
   AND NOT EXISTS(SELECT 1 FROM blocked WHERE (a=r.learner_id AND b=r.mentor_id) OR (b=r.learner_id AND a=r.mentor_id))))
  OR (f.group_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.mentor_study_groups g WHERE g.id=f.group_id AND g.status='open' AND EXISTS(SELECT 1 FROM eligible WHERE id=g.owner_id))
   AND EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=f.group_id AND user_id=auth.uid())
   AND EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=f.group_id AND user_id=f.owner_id)
   AND NOT EXISTS(SELECT 1 FROM public.mentor_group_members m JOIN blocked b ON (b.a=m.user_id AND b.b IN(auth.uid(),f.owner_id)) OR (b.b=m.user_id AND b.a IN(auth.uid(),f.owner_id)) WHERE m.group_id=f.group_id)))
 ) SELECT path,owner_id,mime,size,committed FROM contexts WHERE committed OR owner_id=auth.uid();
REVOKE ALL ON mentor_private.mentor_material_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON mentor_private.mentor_material_permissions TO authenticated,anon;
-- Mutating object policies alone are snapshot checks. Serialize actual writes with
-- metadata commit/abort and core block mutations, then recheck after acquiring locks.
CREATE OR REPLACE FUNCTION public.mentor_ac__storage_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.mentor_materials; u uuid; object_name text; BEGIN
 IF (TG_OP='DELETE' AND OLD.bucket_id<>'mentor-materials') OR (TG_OP='INSERT' AND NEW.bucket_id<>'mentor-materials') OR (TG_OP='UPDATE' AND OLD.bucket_id<>'mentor-materials' AND NEW.bucket_id<>'mentor-materials') THEN RETURN coalesce(NEW,OLD); END IF;
 -- Administrative maintenance is not an application API. The RLS role still guards clients.
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN coalesce(NEW,OLD); END IF;
 u:=public.mentor_ac__actor(); object_name:=CASE WHEN TG_OP='DELETE' THEN OLD.name ELSE NEW.name END;
 SELECT * INTO f FROM public.mentor_materials WHERE path=object_name;
 PERFORM public.mentor_ac__context_lock(f.request_id,f.group_id);
 SELECT * INTO f FROM public.mentor_materials WHERE path=object_name FOR UPDATE;
 IF NOT FOUND OR f.owner_id<>u OR f.committed OR NOT public.mentor_ac__context(f.request_id,f.group_id,u) OR TG_OP='UPDATE' THEN RAISE EXCEPTION 'Upload indisponível.' USING ERRCODE='42501'; END IF;
 -- Storage's canUpload transaction inserts version='1' before streaming bytes,
 -- without final size (multipart contentLength includes envelope overhead). That
 -- transaction is rolled back by Storage; commit still requires final size/MIME.
 IF TG_OP='INSERT' AND (NEW.owner_id IS DISTINCT FROM u::text OR NOT coalesce(
  (NEW.metadata->>'mimetype'=f.mime AND NEW.metadata->>'size'=f.size::text)
  OR (NEW.version='1' AND NEW.metadata->>'size' IS NULL AND (NEW.metadata->>'mimetype' IS NULL OR NEW.metadata->>'mimetype'=f.mime)),false)) THEN RAISE EXCEPTION 'Upload incompatível.' USING ERRCODE='42501'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS mentor_material_write_guard ON storage.objects;
CREATE TRIGGER mentor_material_write_guard BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.mentor_ac__storage_write();
-- Restrictive guards prevent unrelated permissive legacy policies from widening this bucket.
DROP POLICY IF EXISTS mentor_material_select ON storage.objects;
CREATE POLICY mentor_material_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='mentor-materials' AND EXISTS(SELECT 1 FROM mentor_private.mentor_material_permissions p WHERE p.path=name));
DROP POLICY IF EXISTS mentor_material_insert ON storage.objects;
CREATE POLICY mentor_material_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='mentor-materials' AND owner_id=auth.uid()::text AND EXISTS(SELECT 1 FROM mentor_private.mentor_material_permissions p WHERE p.path=name AND p.owner_id=auth.uid() AND NOT p.committed AND ((p.mime=metadata->>'mimetype' AND p.size::text=metadata->>'size') OR (version='1' AND metadata->>'size' IS NULL AND (metadata->>'mimetype' IS NULL OR metadata->>'mimetype'=p.mime)))));
DROP POLICY IF EXISTS mentor_material_delete ON storage.objects;
CREATE POLICY mentor_material_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='mentor-materials' AND owner_id=auth.uid()::text AND EXISTS(SELECT 1 FROM mentor_private.mentor_material_permissions p WHERE p.path=name AND p.owner_id=auth.uid() AND NOT p.committed));
DROP POLICY IF EXISTS mentor_material_select_guard ON storage.objects;
CREATE POLICY mentor_material_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC USING(bucket_id<>'mentor-materials' OR (auth.role()='authenticated' AND EXISTS(SELECT 1 FROM mentor_private.mentor_material_permissions p WHERE p.path=name)));
DROP POLICY IF EXISTS mentor_material_insert_guard ON storage.objects;
CREATE POLICY mentor_material_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(bucket_id<>'mentor-materials' OR (owner_id=auth.uid()::text AND EXISTS(SELECT 1 FROM mentor_private.mentor_material_permissions p WHERE p.path=name AND p.owner_id=auth.uid() AND NOT p.committed AND ((p.mime=metadata->>'mimetype' AND p.size::text=metadata->>'size') OR (version='1' AND metadata->>'size' IS NULL AND (metadata->>'mimetype' IS NULL OR metadata->>'mimetype'=p.mime))))));
DROP POLICY IF EXISTS mentor_material_update_guard ON storage.objects;
CREATE POLICY mentor_material_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(bucket_id<>'mentor-materials') WITH CHECK(bucket_id<>'mentor-materials');
DROP POLICY IF EXISTS mentor_material_delete_guard ON storage.objects;
CREATE POLICY mentor_material_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'mentor-materials' OR (owner_id=auth.uid()::text AND EXISTS(SELECT 1 FROM mentor_private.mentor_material_permissions p WHERE p.path=name AND p.owner_id=auth.uid() AND NOT p.committed)));

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'mentor_ac\_\_%' ESCAPE '\' OR p.proname=ANY(ARRAY['mentor_groups','mentor_group_create','mentor_group_detail','mentor_group_join','mentor_group_leave','mentor_group_cancel','mentor_group_send','mentor_group_suggestions','mentor_group_invite','mentor_sessions','mentor_session_save','mentor_session_respond','mentor_session_cancel','mentor_file_prepare','mentor_file_commit','mentor_files','mentor_file_abort','mentor_review','mentor_reviews','mentor_notifications','mentor_notification_read'])) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname NOT LIKE 'mentor_ac\_\_%' ESCAPE '\' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
