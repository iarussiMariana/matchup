-- Study-group hub. Apply ONLY after the deployed core, academic, catalog and product upgrades.
-- Append-only schema upgrade; no historical migrations, fixtures or account changes.
-- Deployment: node tools\deploy-groups.cjs (offline), then --apply (explicit commit).
-- Verification: node tests\mentorship-groups-backend.cjs --run (always rolls back).
-- RPCs: mentor_group_join_code(text); mentor_group_update(uuid,jsonb);
-- mentor_group_code(uuid,'get'|'rotate'|'disable'); mentor_group_remove(uuid,uuid).
-- New groups are private with 12 places including the organizer; existing visibility/capacity
-- is preserved. Removal permanently denies re-entry to that group, even after code rotation.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('spark:mentor:groups-deploy',0));
DO $$ BEGIN
 IF to_regclass('public.mentor_restrictions') IS NULL
 OR position('mentor_restrictions' IN pg_get_functiondef('public.mentor__eligible(uuid)'::regprocedure))=0
 OR position('mentor_restrictions' IN pg_get_functiondef('public.mentor_actor()'::regprocedure))=0 THEN
  RAISE EXCEPTION 'Product restrictions prerequisite missing';
 END IF;
END $$;
-- Existing rows stay public. Only future inserts default to private.
ALTER TABLE public.mentor_study_groups
 ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN('public','private')),
 ADD COLUMN IF NOT EXISTS enrollment_open boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'presencial' CHECK(format IN('presencial','online','hibrido')),
 ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '' CHECK(length(location)<=200);
ALTER TABLE public.mentor_study_groups ALTER COLUMN visibility SET DEFAULT 'private';
ALTER TABLE public.mentor_study_groups ALTER COLUMN capacity SET DEFAULT 12;
ALTER TABLE public.mentor_study_groups DROP CONSTRAINT IF EXISTS mentor_study_groups_capacity_check;
ALTER TABLE public.mentor_study_groups ADD CONSTRAINT mentor_study_groups_capacity_check CHECK(capacity BETWEEN 2 AND 100);
CREATE TABLE IF NOT EXISTS public.mentor_group_codes (
 group_id uuid PRIMARY KEY REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE,
 code text UNIQUE CHECK(code IS NULL OR code ~ '^[0-9A-F]{32}$'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Removal is a lasting owner decision, not just deletion of membership. Rotation never clears it.
CREATE TABLE IF NOT EXISTS public.mentor_group_removals (
 group_id uuid REFERENCES public.mentor_study_groups(id) ON DELETE CASCADE,
 user_id uuid REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 removed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,user_id)
);
ALTER TABLE public.mentor_group_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_group_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_group_codes,public.mentor_group_removals FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mentor_groups__eligible(g uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.mentor__eligible(u) AND EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=u)
 AND EXISTS(SELECT 1 FROM public.mentor_study_groups x WHERE x.id=g AND public.mentor__eligible(x.owner_id) AND NOT public.mentor__blocked(u,x.owner_id))
 AND NOT EXISTS(SELECT 1 FROM public.mentor_group_members m WHERE m.group_id=g AND public.mentor__blocked(u,m.user_id))
 AND NOT EXISTS(SELECT 1 FROM public.mentor_group_removals r WHERE r.group_id=g AND r.user_id=u);
$$;
CREATE OR REPLACE FUNCTION public.mentor_ac__group_visible(g uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.mentor_groups__eligible(g,u) AND EXISTS(SELECT 1 FROM public.mentor_study_groups x WHERE x.id=g
 AND (EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=g AND user_id=u)
 OR (x.status='open' AND (x.visibility='public' OR EXISTS(SELECT 1 FROM public.mentor_group_invitations WHERE group_id=g AND user_id=u)))));
$$;
-- Public cards never contain meeting locations/links or invitation codes.
CREATE OR REPLACE FUNCTION public.mentor_ac__group(g public.mentor_study_groups,u uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',g.id,'name',g.name,'subject',g.subject,'topic',g.topic,'objective',g.objective,'capacity',g.capacity,'starts_at',g.starts_at,'needs_mentor',g.needs_mentor,'owner_id',g.owner_id,'status',g.status,
 'visibility',g.visibility,'enrollment_open',g.enrollment_open,'format',g.format,
 'member_count',(SELECT count(*) FROM public.mentor_group_members WHERE group_id=g.id),
 'is_member',EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=g.id AND user_id=u),'is_owner',g.owner_id=u);
$$;
CREATE OR REPLACE FUNCTION public.mentor_groups__validate(p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN('name','subject','topic','objective','capacity','starts_at','needs_mentor','visibility','enrollment_open','format','location')) THEN RAISE EXCEPTION 'Configuração inválida.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor_ac__text(p,'name',100,true); PERFORM public.mentor_ac__text(p,'subject',256,true);
 PERFORM public.mentor_ac__text(p,'topic',160); PERFORM public.mentor_ac__text(p,'objective',1000); PERFORM public.mentor_ac__text(p,'location',200);
 IF jsonb_typeof(p->'capacity') IS DISTINCT FROM 'number' OR p->>'capacity' !~ '^[0-9]{1,3}$' OR (p->>'capacity')::integer NOT BETWEEN 2 AND 100
 OR jsonb_typeof(p->'needs_mentor') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'enrollment_open') IS DISTINCT FROM 'boolean'
 OR p->>'visibility' IS NULL OR p->>'visibility' NOT IN('public','private') OR p->>'format' IS NULL OR p->>'format' NOT IN('presencial','online','hibrido') THEN RAISE EXCEPTION 'Configuração inválida.' USING ERRCODE='22023'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_create(p_group jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; p jsonb; BEGIN
 IF jsonb_typeof(p_group) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE='22023'; END IF;
 p:=jsonb_build_object('capacity',12,'needs_mentor',false,'enrollment_open',true,'visibility','private','format','presencial')||p_group;
 PERFORM public.mentor_groups__validate(p); PERFORM public.mentor__lock(u); PERFORM public.mentor_ac__actor();
 INSERT INTO public.mentor_study_groups(owner_id,name,subject,topic,objective,capacity,starts_at,needs_mentor,visibility,enrollment_open,format,location)
 VALUES(u,public.mentor_ac__text(p,'name',100,true),public.mentor_ac__text(p,'subject',256,true),public.mentor_ac__text(p,'topic',160),public.mentor_ac__text(p,'objective',1000),(p->>'capacity')::integer,public.mentor_ac__date(p,'starts_at'),(p->>'needs_mentor')::boolean,p->>'visibility',(p->>'enrollment_open')::boolean,p->>'format',public.mentor_ac__text(p,'location',200)) RETURNING * INTO g;
 INSERT INTO public.mentor_group_members(group_id,user_id) VALUES(g.id,u);
 RETURN public.mentor_ac__group(g,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_update(p_group uuid,p_changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; p jsonb; d timestamptz; BEGIN
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Configuração inválida.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor();
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR g.owner_id<>u THEN RAISE EXCEPTION 'Somente o organizador pode editar.' USING ERRCODE='42501'; END IF;
 IF g.status<>'open' THEN RAISE EXCEPTION 'Grupo arquivado.' USING ERRCODE='22023'; END IF;
 p:=jsonb_build_object('name',g.name,'subject',g.subject,'topic',g.topic,'objective',g.objective,'capacity',g.capacity,'starts_at',g.starts_at,'needs_mentor',g.needs_mentor,'visibility',g.visibility,'enrollment_open',g.enrollment_open,'format',g.format,'location',g.location)||p_changes;
 PERFORM public.mentor_groups__validate(p);
 IF (p->>'capacity')::integer<(SELECT count(*) FROM public.mentor_group_members WHERE group_id=p_group) THEN RAISE EXCEPTION 'Capacidade menor que o número de membros.' USING ERRCODE='22023'; END IF;
 d:=g.starts_at;
 IF p_changes ? 'starts_at' AND p_changes->'starts_at' IS DISTINCT FROM to_jsonb(g.starts_at) THEN
  -- An unchanged historic preferred date remains valid; only new dates must be future.
  BEGIN d:=NULLIF(p_changes->>'starts_at','')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='22023'; END;
  IF d IS DISTINCT FROM g.starts_at THEN d:=public.mentor_ac__date(p_changes,'starts_at'); END IF;
 END IF;
 UPDATE public.mentor_study_groups SET name=public.mentor_ac__text(p,'name',100,true),subject=public.mentor_ac__text(p,'subject',256,true),topic=public.mentor_ac__text(p,'topic',160),objective=public.mentor_ac__text(p,'objective',1000),capacity=(p->>'capacity')::integer,starts_at=d,needs_mentor=(p->>'needs_mentor')::boolean,visibility=p->>'visibility',enrollment_open=(p->>'enrollment_open')::boolean,format=p->>'format',location=public.mentor_ac__text(p,'location',200) WHERE id=p_group RETURNING * INTO g;
 RETURN public.mentor_ac__group(g,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_detail(p_group uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; members jsonb:='[]'; messages jsonb:='[]'; result jsonb; BEGIN
 IF NOT public.mentor_ac__group_visible(p_group,u) THEN RAISE EXCEPTION 'Grupo indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group;
 result:=public.mentor_ac__group(g,u);
 IF public.mentor_ac__group_access(p_group,u,true) THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'course',p.course,'subjects',p.subjects) ORDER BY m.joined_at,p.id),'[]') INTO members FROM public.mentor_group_members m JOIN public.mentor_profiles p ON p.id=m.user_id WHERE m.group_id=p_group AND public.mentor__eligible(p.id);
  IF g.status='open' THEN
   SELECT coalesce(jsonb_agg(public.mentor_ac__group_message(q) ORDER BY q.created_at,q.id),'[]') INTO messages FROM (SELECT m.* FROM public.mentor_group_messages m WHERE m.group_id=p_group AND public.mentor__eligible(m.sender_id) AND NOT public.mentor__blocked(u,m.sender_id) ORDER BY m.created_at DESC,m.id DESC LIMIT 200) q;
  END IF;
  result:=result||jsonb_build_object('location',g.location);
 END IF;
 RETURN result||jsonb_build_object('members',members,'messages',messages);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_groups__join(p_group uuid,p_code text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor();
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR NOT public.mentor_groups__eligible(p_group,u) THEN RAISE EXCEPTION 'Grupo ou convite indisponível.' USING ERRCODE='42501'; END IF;
 -- Recheck the code AFTER obtaining the group lock: concurrent rotation/disable wins safely.
 IF p_code IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.mentor_group_codes WHERE group_id=p_group AND code=p_code) THEN RAISE EXCEPTION 'Grupo ou convite indisponível.' USING ERRCODE='42501'; END IF;
 ELSIF NOT public.mentor_ac__group_visible(p_group,u) THEN RAISE EXCEPTION 'Grupo ou convite indisponível.' USING ERRCODE='42501'; END IF;
 IF g.status<>'open' THEN RAISE EXCEPTION 'Grupo arquivado.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=u) THEN RETURN public.mentor_ac__group(g,u); END IF;
 IF NOT g.enrollment_open THEN RAISE EXCEPTION 'Inscrições encerradas.' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM public.mentor_group_members WHERE group_id=p_group)>=g.capacity THEN RAISE EXCEPTION 'Grupo completo.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.mentor_group_members(group_id,user_id) VALUES(p_group,u);
 INSERT INTO public.mentor_session_participants(session_id,user_id,response) SELECT id,u,'pending' FROM public.mentor_study_sessions WHERE group_id=p_group AND status<>'cancelled' AND starts_at>clock_timestamp() ON CONFLICT(session_id,user_id) DO UPDATE SET response='pending';
 UPDATE public.mentor_study_sessions SET status='pending',updated_at=clock_timestamp() WHERE group_id=p_group AND status<>'cancelled' AND starts_at>clock_timestamp();
 RETURN public.mentor_ac__group(g,u);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_join(p_group uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN public.mentor_groups__join(p_group); END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g uuid; c text; BEGIN
 IF p_code IS NULL OR length(p_code)>120 THEN RAISE EXCEPTION 'Código inválido.' USING ERRCODE='22023'; END IF;
 c:=upper(regexp_replace(p_code,'[-[:space:]]','','g'));
 IF c !~ '^[0-9A-F]{32}$' THEN RAISE EXCEPTION 'Código inválido.' USING ERRCODE='22023'; END IF;
 SELECT group_id INTO g FROM public.mentor_group_codes WHERE code=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Grupo ou convite indisponível.' USING ERRCODE='42501'; END IF;
 RETURN public.mentor_groups__join(g,c);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_code(p_group uuid,p_action text DEFAULT 'get') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; c text; BEGIN
 IF p_action IS NULL OR p_action NOT IN('get','rotate','disable') THEN RAISE EXCEPTION 'Ação inválida.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor();
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR g.owner_id<>u THEN RAISE EXCEPTION 'Somente o organizador pode gerenciar convites.' USING ERRCODE='42501'; END IF;
 IF p_action='rotate' THEN
  IF g.status<>'open' THEN RAISE EXCEPTION 'Grupo arquivado.' USING ERRCODE='22023'; END IF;
  -- PostgreSQL random UUIDs contain 122 cryptographically random bits.
  c:=upper(replace(gen_random_uuid()::text,'-',''));
  INSERT INTO public.mentor_group_codes(group_id,code) VALUES(p_group,c) ON CONFLICT(group_id) DO UPDATE SET code=excluded.code,updated_at=clock_timestamp();
 ELSIF p_action='disable' THEN UPDATE public.mentor_group_codes SET code=NULL,updated_at=clock_timestamp() WHERE group_id=p_group;
 END IF;
 SELECT code INTO c FROM public.mentor_group_codes WHERE group_id=p_group;
 RETURN jsonb_build_object('code',c,'enabled',c IS NOT NULL AND g.status='open');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_remove(p_group uuid,p_user uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 PERFORM public.mentor_ac__group_lock(p_group,p_user); PERFORM public.mentor_ac__actor();
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR g.owner_id<>u THEN RAISE EXCEPTION 'Somente o organizador pode remover.' USING ERRCODE='42501'; END IF;
 IF p_user IS NULL OR p_user=u THEN RAISE EXCEPTION 'Participante inválido.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.mentor_group_removals WHERE group_id=p_group AND user_id=p_user) THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=p_user) THEN RAISE EXCEPTION 'Participante indisponível.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.mentor_group_removals(group_id,user_id) VALUES(p_group,p_user);
 DELETE FROM public.mentor_group_members WHERE group_id=p_group AND user_id=p_user;
 DELETE FROM public.mentor_group_invitations WHERE group_id=p_group AND user_id=p_user;
 UPDATE public.mentor_session_participants p SET response='declined' FROM public.mentor_study_sessions s WHERE s.id=p.session_id AND s.group_id=p_group AND p.user_id=p_user AND s.status<>'cancelled' AND s.starts_at>clock_timestamp();
 UPDATE public.mentor_study_sessions s SET status='pending',updated_at=clock_timestamp() WHERE s.group_id=p_group AND s.status<>'cancelled' AND s.starts_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.mentor_session_participants p WHERE p.session_id=s.id AND p.user_id=p_user);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_suggestions(p_group uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group AND owner_id=u;
 IF NOT FOUND OR NOT public.mentor_ac__group_access(p_group,u) THEN RAISE EXCEPTION 'Somente o organizador pode consultar.' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'course',q.course,'subjects',q.subjects) ORDER BY q.name,q.id) FROM (SELECT p.* FROM public.mentor_profiles p WHERE p.id<>u AND public.mentor_can_contact(p.id) AND public.mentor_groups__eligible(p_group,p.id)
 AND NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=p.id)
 AND EXISTS(SELECT 1 FROM unnest(p.subjects||p.learning_subjects||p.current_subjects||p.topics) s WHERE lower(btrim(s)) IN(lower(g.subject),lower(g.topic))) ORDER BY p.name,p.id LIMIT 20) q),'[]');
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_invite(p_group uuid,p_user uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 PERFORM public.mentor_ac__group_lock(p_group,p_user); PERFORM public.mentor_ac__actor();
 SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND OR g.owner_id<>u OR NOT public.mentor_ac__group_access(p_group,u) OR NOT public.mentor_can_contact(p_user) OR NOT public.mentor_groups__eligible(p_group,p_user) THEN RAISE EXCEPTION 'Convite indisponível.' USING ERRCODE='42501'; END IF;
 IF NOT g.enrollment_open THEN RAISE EXCEPTION 'Inscrições encerradas.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mentor_group_members WHERE group_id=p_group AND user_id=p_user) THEN INSERT INTO public.mentor_group_invitations(group_id,user_id) VALUES(p_group,p_user) ON CONFLICT DO NOTHING; END IF;
 RETURN true;
END $$;
-- Leave and archive retain their historical agenda semantics. Delete targeted invitations
-- on voluntary departure; revoke the reusable code when the owner archives the group.
CREATE OR REPLACE FUNCTION public.mentor_group_leave(p_group uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); g public.mentor_study_groups; BEGIN
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor(); SELECT * INTO g FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Grupo indisponível.' USING ERRCODE='42501'; END IF;
 IF g.owner_id=u THEN RAISE EXCEPTION 'O organizador deve arquivar o grupo.' USING ERRCODE='22023'; END IF;
 DELETE FROM public.mentor_group_invitations WHERE group_id=p_group AND user_id=u;
 DELETE FROM public.mentor_group_members WHERE group_id=p_group AND user_id=u;
 IF NOT FOUND THEN RETURN true; END IF;
 UPDATE public.mentor_session_participants p SET response='declined' FROM public.mentor_study_sessions s WHERE s.id=p.session_id AND s.group_id=p_group AND p.user_id=u AND s.status<>'cancelled' AND s.starts_at>clock_timestamp();
 UPDATE public.mentor_study_sessions s SET status='pending',updated_at=clock_timestamp() WHERE s.group_id=p_group AND s.status<>'cancelled' AND s.starts_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.mentor_session_participants p WHERE p.session_id=s.id AND p.user_id=u);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_group_cancel(p_group uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor_ac__actor(); BEGIN
 PERFORM public.mentor_ac__group_lock(p_group); PERFORM public.mentor_ac__actor();
 IF NOT EXISTS(SELECT 1 FROM public.mentor_study_groups WHERE id=p_group AND owner_id=u) THEN RAISE EXCEPTION 'Somente o organizador pode arquivar.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.mentor_study_groups WHERE id=p_group FOR UPDATE;
 UPDATE public.mentor_study_groups SET status='cancelled',enrollment_open=false WHERE id=p_group;
 UPDATE public.mentor_group_codes SET code=NULL,updated_at=clock_timestamp() WHERE group_id=p_group;
 UPDATE public.mentor_study_sessions SET status='cancelled',updated_at=clock_timestamp() WHERE group_id=p_group AND status<>'cancelled' AND starts_at>clock_timestamp();
 RETURN true;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'mentor_groups__%' OR proname IN('mentor_group_create','mentor_group_update','mentor_group_detail','mentor_group_join','mentor_group_join_code','mentor_group_code','mentor_group_remove','mentor_group_suggestions','mentor_group_invite','mentor_group_leave','mentor_group_cancel','mentor_ac__group','mentor_ac__group_visible')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  IF r.proname NOT LIKE 'mentor_groups__%' AND r.proname NOT LIKE 'mentor_ac__%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
