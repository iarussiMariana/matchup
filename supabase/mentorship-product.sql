-- Additive product upgrade. Requires core, academic and catalog migrations.
-- No seeds, account bans, deletes or production data rewrites. Run deploy-product --apply explicitly.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('spark:mentor:product-deploy',0));

CREATE OR REPLACE FUNCTION public.mentor_product__slots(a text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a IS NOT NULL AND cardinality(a)<=21 AND
   NOT EXISTS(SELECT 1 FROM unnest(a) x WHERE x IS NULL OR x !~ '^(seg|ter|qua|qui|sex|sab|dom)-(manha|tarde|noite)$')
   AND cardinality(a)=(SELECT count(DISTINCT x) FROM unnest(a) x);
$$;
ALTER TABLE public.mentor_profiles
 ADD COLUMN IF NOT EXISTS methodology text NOT NULL DEFAULT '' CHECK(length(methodology)<=1000),
 ADD COLUMN IF NOT EXISTS experience text NOT NULL DEFAULT '' CHECK(length(experience)<=1000),
 ADD COLUMN IF NOT EXISTS availability_slots text[] NOT NULL DEFAULT '{}' CHECK(public.mentor_product__slots(availability_slots));
ALTER TABLE public.mentor_requests
 ADD COLUMN IF NOT EXISTS question text NOT NULL DEFAULT '' CHECK(question='' OR length(question) BETWEEN 10 AND 1000),
 ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT '' CHECK(objective='' OR length(objective) BETWEEN 5 AND 500),
 ADD COLUMN IF NOT EXISTS proposed_at timestamptz CHECK(proposed_at IS NULL OR isfinite(proposed_at));
CREATE TABLE IF NOT EXISTS public.mentor_favorites (
 owner_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.mentor_profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,user_id), CHECK(owner_id<>user_id)
);
CREATE TABLE IF NOT EXISTS public.mentor_moderators (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.mentor_restrictions (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 restricted boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.mentor_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid REFERENCES public.mentor_profiles(id) ON DELETE SET NULL,
 target_id uuid REFERENCES public.mentor_profiles(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK(reason IN ('harassment','spam','impersonation','inappropriate','other')),
 details text NOT NULL CHECK(length(details) BETWEEN 10 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz,
 resolution_note text NOT NULL DEFAULT '',
 CHECK(reporter_id<>target_id)
);
CREATE TABLE IF NOT EXISTS public.mentor_moderation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES public.mentor_reports(id),
 -- Historical identifiers have no cascading FK: account removal must not rewrite audit.
 moderator_id uuid NOT NULL,
 target_id uuid,
 previous_status text NOT NULL,
 status text NOT NULL CHECK(status IN ('reviewed','dismissed')),
 action text NOT NULL CHECK(action IN ('none','restrict','restore')),
 note text NOT NULL CHECK(length(note)<=2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS mentor_reports_pending ON public.mentor_reports(reporter_id,target_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS mentor_reports_owner_date ON public.mentor_reports(reporter_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS mentor_reports_queue ON public.mentor_reports(status,created_at,id);
CREATE INDEX IF NOT EXISTS mentor_audit_report ON public.mentor_moderation_audit(report_id,created_at,id);
CREATE INDEX IF NOT EXISTS mentor_product_course_semester ON public.mentor_profiles(catalog_course_id,semester,format,id);
CREATE INDEX IF NOT EXISTS mentor_product_slots ON public.mentor_profiles USING gin(availability_slots);
CREATE INDEX IF NOT EXISTS mentor_favorites_target ON public.mentor_favorites(user_id,owner_id);
ALTER TABLE public.mentor_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_moderation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_favorites,public.mentor_moderators,public.mentor_restrictions,
 public.mentor_reports,public.mentor_moderation_audit FROM PUBLIC,anon,authenticated;

-- Mutual learning is explicit: both saved the same learning subject, both permit
-- individual study, and formats overlap. Merely sharing a course never exposes opt-outs.
CREATE OR REPLACE FUNCTION public.mentor_product__learner_match(u uuid,t uuid,s text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(u<>t,false) AND EXISTS(
  SELECT 1 FROM public.mentor_profiles a JOIN public.mentor_profiles b ON b.id=t
  CROSS JOIN LATERAL unnest(a.learning_subjects) x
  CROSS JOIN LATERAL unnest(b.learning_subjects) y
  WHERE a.id=u AND a.study_preference IN ('individual','ambos') AND b.study_preference IN ('individual','ambos')
   AND (a.format=b.format OR a.format='hibrido' OR b.format='hibrido')
   AND lower(btrim(x))=lower(btrim(y)) AND (s IS NULL OR lower(btrim(y))=lower(btrim(s))));
$$;

-- Full known helper bodies are compared, not just a potentially ambiguous substring.
DO $guard$
DECLARE r record; src text; def text; actual oid;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('public.mentor__eligible(uuid)',
 $old$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user AND isfinite(p.birth_date)
      AND p.birth_date <= (CURRENT_DATE - interval '18 years')::date
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now()));
$old$,
 $new$
  SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user AND isfinite(p.birth_date)
      AND p.birth_date <= (CURRENT_DATE - interval '18 years')::date
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND NOT EXISTS(SELECT 1 FROM public.mentor_restrictions r WHERE r.user_id=p_user AND r.restricted));
$new$),
 ('public.mentor_actor()',
 $old$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.mentor__eligible(v_uid) THEN
    RAISE EXCEPTION 'Conta ativa e idade de 18 anos ou mais obrigatórias.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$old$,
 $new$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF EXISTS(SELECT 1 FROM public.mentor_restrictions WHERE user_id=v_uid AND restricted) THEN
    RAISE EXCEPTION 'Conta temporariamente restrita na mentoria. Contate a moderação para revisão.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.mentor__eligible(v_uid) THEN
    RAISE EXCEPTION 'Conta ativa e idade de 18 anos ou mais obrigatórias.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$new$),
 ('public.mentor__profile(public.mentor_profiles)',
 $old$
  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'course', p.course, 'semester', p.semester,
    'bio', p.bio, 'subjects', p.subjects, 'learning_subjects', p.learning_subjects,
    'availability', p.availability, 'format', p.format, 'photo_url', p.photo_url, 'active', p.active,
    'institution', p.institution, 'city', p.city, 'current_subjects', p.current_subjects,
    'topics', p.topics, 'study_preference', p.study_preference, 'catalog_course_id', p.catalog_course_id);
$old$,
 $new$
  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'course', p.course, 'semester', p.semester,
    'bio', p.bio, 'subjects', p.subjects, 'learning_subjects', p.learning_subjects,
    'availability', p.availability, 'format', p.format, 'photo_url', p.photo_url, 'active', p.active,
    'institution', p.institution, 'city', p.city, 'current_subjects', p.current_subjects,
    'topics', p.topics, 'study_preference', p.study_preference, 'catalog_course_id', p.catalog_course_id,
    'methodology',p.methodology,'experience',p.experience,'availability_slots',p.availability_slots,
    'is_favorite',EXISTS(SELECT 1 FROM public.mentor_favorites f WHERE f.owner_id=auth.uid() AND f.user_id=p.id));
$new$),
 ('public.mentor__request(public.mentor_requests)',
 $old$
  SELECT jsonb_build_object('id', p.id, 'learner_id', p.learner_id, 'mentor_id', p.mentor_id,
    'subject', p.subject, 'status', p.status, 'created_at', p.created_at);
$old$,
 $new$
  SELECT jsonb_build_object('id', p.id, 'learner_id', p.learner_id, 'mentor_id', p.mentor_id,
    'subject', p.subject, 'status', p.status, 'created_at', p.created_at,
    'question',p.question,'objective',p.objective,'proposed_at',p.proposed_at);
$new$)
,
 ('public.mentor_ac__session(public.mentor_study_sessions,uuid)',
 $old$
 SELECT jsonb_build_object('id',s.id,'request_id',s.request_id,'group_id',s.group_id,'title',s.title,'subject',s.subject,'topic',s.topic,'starts_at',s.starts_at,'duration_minutes',s.duration_minutes,'location',s.location,'format',s.format,'created_by',s.created_by,'status',s.status,
 'my_response',(SELECT response FROM public.mentor_session_participants WHERE session_id=s.id AND user_id=u),
 'participants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'response',x.response) ORDER BY p.name,p.id) FROM public.mentor_session_participants x JOIN public.mentor_profiles p ON p.id=x.user_id WHERE x.session_id=s.id AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(u,p.id)),'[]'),
 'is_creator',s.created_by=u,'mentor_id',public.mentor_ac__recipient(s),'can_review',public.mentor_ac__can_review(s,u));
$old$,
 $new$
 SELECT jsonb_build_object('id',s.id,'request_id',s.request_id,'group_id',s.group_id,'title',s.title,'subject',s.subject,'topic',s.topic,'starts_at',s.starts_at,'duration_minutes',s.duration_minutes,'location',s.location,'format',s.format,'created_by',s.created_by,'status',s.status,
 'created_at',s.created_at,'updated_at',s.updated_at,
 'my_response',(SELECT response FROM public.mentor_session_participants WHERE session_id=s.id AND user_id=u),
 'participants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'response',x.response) ORDER BY p.name,p.id) FROM public.mentor_session_participants x JOIN public.mentor_profiles p ON p.id=x.user_id WHERE x.session_id=s.id AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(u,p.id)),'[]'),
 'is_creator',s.created_by=u,'mentor_id',public.mentor_ac__recipient(s),'can_review',public.mentor_ac__can_review(s,u));
$new$)
 ) patches(signature,old_body,new_body) LOOP
  actual:=to_regprocedure(r.signature);
  IF actual IS NULL THEN RAISE EXCEPTION 'Product prerequisite missing: %',r.signature; END IF;
  SELECT prosrc INTO src FROM pg_proc WHERE oid=actual;
  r.old_body:=replace(r.old_body,E'\r\n',E'\n');
  r.new_body:=replace(r.new_body,E'\r\n',E'\n');
  IF replace(src,E'\r\n',E'\n')=r.old_body THEN
   def:=pg_get_functiondef(actual); EXECUTE replace(def,src,r.new_body);
  ELSIF replace(src,E'\r\n',E'\n') IS DISTINCT FROM r.new_body THEN
   RAISE EXCEPTION 'Unknown helper version: %. Review product migration.',r.signature;
  END IF;
 END LOOP;
END $guard$;

-- Read-only serialization fields may round-trip through old saves, but never mutate extras.
-- Institution/city may be blank at onboarding; existing type/length validation remains.
-- Recheck actors after the shared account lock so restrictions serialize with legacy writes.
DO $legacy_guard$
DECLARE src text; base text; patched text; def text; r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('public.mentor_save(jsonb)','f62f86750c9b6adf487a30f1c559e41f',
 $old$  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN$old$,
 $new$  p_profile := p_profile - ARRAY['methodology','experience','availability_slots','is_favorite'];
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN$new$,
 $lock$  PERFORM public.mentor__lock(v_uid);$lock$),
 ('public.mentor_request(uuid,text)','c79aef07545a45995f3a5e6b124edd22',
 $old$  SELECT s INTO v_subject FROM public.mentor_profiles p CROSS JOIN LATERAL unnest(p.subjects) s
    WHERE p.id=p_mentor AND p.active AND lower(s)=lower(btrim(p_subject)) LIMIT 1;$old$,
 $new$  SELECT s INTO v_subject FROM public.mentor_profiles p CROSS JOIN LATERAL unnest(p.subjects||p.learning_subjects) s
    WHERE p.id=p_mentor AND lower(s)=lower(btrim(p_subject)) AND
      ((p.active AND EXISTS(SELECT 1 FROM unnest(p.subjects) offered WHERE lower(offered)=lower(s)))
       OR public.mentor_product__learner_match(v_uid,p.id,s)) LIMIT 1;$new$,
 $lock$  PERFORM public.mentor__lock(v_uid,p_mentor);$lock$)
 ) patches(signature,original_hash,old_fragment,new_fragment,lock_fragment) LOOP
  SELECT prosrc INTO src FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  r.old_fragment:=replace(r.old_fragment,E'\r\n',E'\n');
  r.new_fragment:=replace(r.new_fragment,E'\r\n',E'\n');
  base:=replace(replace(src,E'\r\n',E'\n'),r.lock_fragment||E'\n  PERFORM public.mentor__actor();',r.lock_fragment);
  IF r.old_fragment<>r.new_fragment THEN base:=replace(base,r.new_fragment,r.old_fragment); END IF;
  IF r.signature='public.mentor_save(jsonb)' THEN
   base:=replace(base,$optional$(v_key IN ('name','course'))$optional$,$required$(v_key IN ('name','course') OR (v_new AND v_key IN ('institution','city')))$required$);
  END IF;
  IF md5(base) IS DISTINCT FROM r.original_hash THEN RAISE EXCEPTION 'Unknown helper version: %',r.signature; END IF;
  patched:=replace(base,r.old_fragment,r.new_fragment);
  IF r.signature='public.mentor_save(jsonb)' THEN
   patched:=replace(patched,$required$(v_key IN ('name','course') OR (v_new AND v_key IN ('institution','city')))$required$,$optional$(v_key IN ('name','course'))$optional$);
  END IF;
  patched:=replace(patched,r.lock_fragment,r.lock_fragment||E'\n  PERFORM public.mentor__actor();');
  IF src<>patched THEN def:=pg_get_functiondef(to_regprocedure(r.signature)); EXECUTE replace(def,src,patched); END IF;
 END LOOP;
END $legacy_guard$;

-- Keep legacy discovery/profile access and request authorization in agreement with
-- the product endpoint's mutual-learning rule, preserving their original limits.
DO $discovery_guard$
DECLARE r record; src text; base text; patched text; def text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('public.mentor_discover(text)','774118cc126227db4d43b3d55da73da0',
 $old$  FROM (SELECT p.* FROM public.mentor_profiles p WHERE p.id <> v_uid AND p.active
    AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(v_uid,p.id)
    AND (btrim(p_subject) = '' OR EXISTS (SELECT 1 FROM unnest(p.subjects) s WHERE strpos(lower(s),lower(btrim(p_subject))) > 0))$old$,
 $new$  FROM (SELECT p.* FROM public.mentor_profiles p WHERE p.id <> v_uid
    AND (p.active OR public.mentor_product__learner_match(v_uid,p.id))
    AND public.mentor__eligible(p.id) AND NOT public.mentor__blocked(v_uid,p.id)
    AND (btrim(p_subject) = '' OR (p.active AND EXISTS (SELECT 1 FROM unnest(p.subjects) s WHERE strpos(lower(s),lower(btrim(p_subject))) > 0))
      OR EXISTS(SELECT 1 FROM unnest(p.learning_subjects) s WHERE strpos(lower(s),lower(btrim(p_subject)))>0 AND public.mentor_product__learner_match(v_uid,p.id,s)))$new$),
 ('public.mentor_profile(uuid)','d5c71ccfb34e025a2f257c2baf720f5e',
 $old$    AND (p.id=v_uid OR p.active OR EXISTS (SELECT 1 FROM public.mentor_requests r$old$,
 $new$    AND (p.id=v_uid OR p.active OR public.mentor_product__learner_match(v_uid,p.id) OR EXISTS (SELECT 1 FROM public.mentor_requests r$new$)
 ) patches(signature,original_hash,old_fragment,new_fragment) LOOP
  SELECT prosrc INTO src FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  r.old_fragment:=replace(r.old_fragment,E'\r\n',E'\n'); r.new_fragment:=replace(r.new_fragment,E'\r\n',E'\n');
  base:=replace(replace(src,E'\r\n',E'\n'),r.new_fragment,r.old_fragment);
  IF md5(base) IS DISTINCT FROM r.original_hash THEN RAISE EXCEPTION 'Unknown helper version: %',r.signature; END IF;
  patched:=replace(base,r.old_fragment,r.new_fragment);
  IF src<>patched THEN def:=pg_get_functiondef(to_regprocedure(r.signature)); EXECUTE replace(def,src,patched); END IF;
 END LOOP;
END $discovery_guard$;

-- Storage view permissions cannot call private functions as authenticated. Its inline
-- eligibility CTE reads the same protected restriction table, without granting table access.
-- Compare the entire canonical view, including the already-upgraded version.
DO $storage_guard$
DECLARE src text; old_fragment text := 'WHERE isfinite(p.birth_date)';
 new_fragment text := 'WHERE NOT EXISTS (SELECT 1 FROM public.mentor_restrictions restrictions WHERE restrictions.user_id=p.id AND restrictions.restricted) AND isfinite(p.birth_date)';
BEGIN
 SET LOCAL search_path='';
 IF to_regclass('mentor_private.mentor_material_permissions') IS NULL THEN
  RAISE EXCEPTION 'Academic material permissions prerequisite missing.';
 END IF;
 src:=pg_get_viewdef('mentor_private.mentor_material_permissions'::regclass,true);
 IF md5(src)='1ace0102bc52b2ba679a9b25b4db46b9' THEN
  EXECUTE 'CREATE OR REPLACE VIEW mentor_private.mentor_material_permissions WITH (security_barrier=true) AS '||replace(src,old_fragment,new_fragment);
 ELSIF md5(src)<>'69674477e172de355c4e55b4ef868893' THEN
  RAISE EXCEPTION 'Unknown material permission view. Review product migration.';
 END IF;
END $storage_guard$;

CREATE OR REPLACE FUNCTION public.mentor_save_product(p_profile jsonb,p_course_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); p public.mentor_profiles; k text; a text[]; v jsonb;
BEGIN
 IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor__lock(u); PERFORM public.mentor__actor();
 SELECT * INTO p FROM public.mentor_profiles WHERE id=u;
 FOREACH k IN ARRAY ARRAY['methodology','experience'] LOOP
  IF p_profile ? k AND (jsonb_typeof(p_profile->k) IS DISTINCT FROM 'string' OR length(p_profile->>k)>1000) THEN
   RAISE EXCEPTION 'Metodologia ou experiência inválida (máximo 1000 caracteres).' USING ERRCODE='22023';
  END IF;
 END LOOP;
 a:=coalesce(p.availability_slots,'{}'::text[]);
 IF p_profile ? 'availability_slots' THEN
  IF jsonb_typeof(p_profile->'availability_slots') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Horários inválidos.' USING ERRCODE='22023'; END IF;
  a:='{}';
  FOR v IN SELECT value FROM jsonb_array_elements(p_profile->'availability_slots') LOOP
   IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Horários inválidos.' USING ERRCODE='22023'; END IF;
   a:=array_append(a,v#>>'{}');
  END LOOP;
  IF NOT public.mentor_product__slots(a) THEN RAISE EXCEPTION 'Horários inválidos ou repetidos.' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM public.mentor_save_catalog(p_profile-ARRAY['methodology','experience','availability_slots','is_favorite'],p_course_id);
 UPDATE public.mentor_profiles SET methodology=coalesce(btrim(p_profile->>'methodology'),methodology),
  experience=coalesce(btrim(p_profile->>'experience'),experience),availability_slots=a WHERE id=u RETURNING * INTO p;
 RETURN public.mentor__profile(p);
END $$;

-- Saved profiles do not require a currently matching subject. Inactive profiles remain
-- private unless an accepted relationship exists; blocking/eligibility always wins.
CREATE OR REPLACE FUNCTION public.mentor_product__visible(u uuid,t uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(u<>t,false) AND public.mentor__eligible(u) AND public.mentor__eligible(t)
 AND EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=u)
 AND NOT public.mentor__blocked(u,t)
 AND EXISTS(SELECT 1 FROM public.mentor_profiles p WHERE p.id=t AND (p.active OR public.mentor_product__learner_match(u,t) OR EXISTS(
  SELECT 1 FROM public.mentor_requests r WHERE r.status='accepted' AND
   ((r.learner_id=u AND r.mentor_id=t) OR (r.mentor_id=u AND r.learner_id=t)))));
$$;
CREATE OR REPLACE FUNCTION public.mentor_favorites()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); BEGIN
 RETURN coalesce((SELECT jsonb_agg(public.mentor__profile(p) ORDER BY f.created_at DESC,p.id)
 FROM public.mentor_favorites f JOIN public.mentor_profiles p ON p.id=f.user_id
 WHERE f.owner_id=u AND public.mentor_product__visible(u,p.id)),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_favorite(p_user uuid,p_saved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); BEGIN
 IF p_user IS NULL OR p_user=u OR p_saved IS NULL THEN RAISE EXCEPTION 'Favorito inválido.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor__lock(u,p_user); PERFORM public.mentor__actor();
 IF NOT p_saved THEN DELETE FROM public.mentor_favorites WHERE owner_id=u AND user_id=p_user; RETURN false; END IF;
 IF NOT public.mentor_product__visible(u,p_user) THEN RAISE EXCEPTION 'Perfil indisponível.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.mentor_favorites(owner_id,user_id) VALUES(u,p_user) ON CONFLICT DO NOTHING;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_discover_product(p_subject text DEFAULT '',p_course_id text DEFAULT NULL,
 p_semester integer DEFAULT NULL,p_format text DEFAULT NULL,p_slot text DEFAULT NULL,p_favorites_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); BEGIN
 IF p_subject IS NULL OR length(p_subject)>256 OR p_favorites_only IS NULL
  OR (p_course_id IS NOT NULL AND (length(p_course_id)>100 OR p_course_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
  OR (p_semester IS NOT NULL AND p_semester NOT BETWEEN 1 AND 20)
  OR (p_format IS NOT NULL AND p_format NOT IN ('online','presencial','hibrido'))
  OR (p_slot IS NOT NULL AND NOT public.mentor_product__slots(ARRAY[p_slot])) THEN
  RAISE EXCEPTION 'Filtros inválidos.' USING ERRCODE='22023';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(public.mentor__profile(p) ORDER BY p.id) FROM (
  SELECT p.* FROM public.mentor_profiles p WHERE p.id<>u AND public.mentor__eligible(p.id)
   AND NOT public.mentor__blocked(u,p.id)
   AND (p_course_id IS NULL OR p.catalog_course_id=p_course_id)
   AND (p_semester IS NULL OR p.semester=p_semester)
   AND (p_format IS NULL OR p.format=p_format OR (p.format='hibrido' AND p_format IN ('online','presencial')))
   AND (p_slot IS NULL OR p.availability_slots @> ARRAY[p_slot])
   AND CASE WHEN p_favorites_only THEN
     EXISTS(SELECT 1 FROM public.mentor_favorites f WHERE f.owner_id=u AND f.user_id=p.id)
     AND public.mentor_product__visible(u,p.id)
     AND (btrim(p_subject)='' OR EXISTS(SELECT 1 FROM unnest(p.subjects||p.learning_subjects||p.current_subjects) s WHERE strpos(lower(s),lower(btrim(p_subject)))>0))
    ELSE (p.active OR public.mentor_product__learner_match(u,p.id))
     AND (btrim(p_subject)='' OR (p.active AND EXISTS(SELECT 1 FROM unnest(p.subjects) s WHERE strpos(lower(s),lower(btrim(p_subject)))>0))
       OR EXISTS(SELECT 1 FROM unnest(p.learning_subjects) s WHERE strpos(lower(s),lower(btrim(p_subject)))>0 AND public.mentor_product__learner_match(u,p.id,s)))
     AND NOT EXISTS(SELECT 1 FROM public.mentor_requests r WHERE r.learner_id=u AND r.mentor_id=p.id AND r.status IN ('pending','accepted'))
    END
  ORDER BY p.id LIMIT 100
 ) p),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_request_product(p_mentor uuid,p_subject text,p_question text,p_objective text,p_proposed_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); existing_id uuid; result jsonb; r public.mentor_requests;
 q text:=regexp_replace(p_question,'^[[:space:]]+|[[:space:]]+$','','g');
 o text:=regexp_replace(p_objective,'^[[:space:]]+|[[:space:]]+$','','g');
BEGIN
 IF q IS NULL OR length(q) NOT BETWEEN 10 AND 1000 OR o IS NULL OR length(o) NOT BETWEEN 5 AND 500
  OR (p_proposed_at IS NOT NULL AND (NOT isfinite(p_proposed_at) OR p_proposed_at<=clock_timestamp() OR p_proposed_at>clock_timestamp()+interval '1 year')) THEN
  RAISE EXCEPTION 'Informe dúvida (10–1000), objetivo (5–500) e uma data futura em até um ano.' USING ERRCODE='22023';
 END IF;
 PERFORM public.mentor__lock(u,p_mentor); PERFORM public.mentor__actor();
 SELECT id INTO existing_id FROM public.mentor_requests WHERE learner_id=u AND mentor_id=p_mentor
  AND lower(btrim(subject))=lower(btrim(p_subject)) AND status IN ('pending','accepted');
 result:=public.mentor_request(p_mentor,p_subject);
 IF existing_id IS NULL THEN
  UPDATE public.mentor_requests SET question=q,objective=o,proposed_at=p_proposed_at WHERE id=(result->>'id')::uuid RETURNING * INTO r;
  RETURN public.mentor__request(r);
 END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_report(p_user uuid,p_reason text,p_details text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); r uuid;
 d text:=regexp_replace(p_details,'^[[:space:]]+|[[:space:]]+$','','g'); BEGIN
 IF p_user IS NULL OR p_user=u OR p_reason IS NULL OR p_reason NOT IN ('harassment','spam','impersonation','inappropriate','other')
  OR d IS NULL OR length(d) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Denúncia inválida.' USING ERRCODE='22023'; END IF;
 PERFORM public.mentor__lock(u,p_user); PERFORM public.mentor__actor();
 -- A block itself is evidence of a known peer; it must not disclose a new private profile.
 IF NOT EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=u) OR NOT EXISTS(SELECT 1 FROM public.mentor_profiles WHERE id=p_user)
  OR NOT (public.mentor_product__visible(u,p_user) OR public.mentor__blocked(u,p_user)
   OR EXISTS(SELECT 1 FROM public.mentor_requests WHERE (learner_id=u AND mentor_id=p_user) OR (mentor_id=u AND learner_id=p_user))
   OR EXISTS(SELECT 1 FROM public.mentor_group_members a JOIN public.mentor_group_members b ON b.group_id=a.group_id
     WHERE a.user_id=u AND b.user_id=p_user AND public.mentor_ac__group_access(a.group_id,u,true))) THEN
  RAISE EXCEPTION 'Perfil indisponível.' USING ERRCODE='42501';
 END IF;
 SELECT id INTO r FROM public.mentor_reports WHERE reporter_id=u AND target_id=p_user AND status='pending';
 IF FOUND THEN RETURN r; END IF;
 IF (SELECT count(*) FROM public.mentor_reports WHERE reporter_id=u AND created_at>clock_timestamp()-interval '1 day')>=10 THEN
  RAISE EXCEPTION 'Limite de denúncias atingido. Tente novamente amanhã.' USING ERRCODE='54000';
 END IF;
 INSERT INTO public.mentor_reports(reporter_id,target_id,reason,details) VALUES(u,p_user,p_reason,d) RETURNING id INTO r;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.mentor_my_reports()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=public.mentor__actor(); BEGIN
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'target_id',r.target_id,'reason',r.reason,
  'status',r.status,'created_at',r.created_at,'resolved_at',r.resolved_at,'resolution_note',r.resolution_note)
  ORDER BY r.created_at DESC,r.id) FROM public.mentor_reports r WHERE r.reporter_id=u),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_moderation_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.mentor__eligible(auth.uid()) AND EXISTS(SELECT 1 FROM public.mentor_moderators WHERE user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.mentor_moderation_queue(p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.mentor_moderation_access() THEN RAISE EXCEPTION 'Acesso de moderação obrigatório.' USING ERRCODE='42501'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('pending','reviewed','dismissed') THEN RAISE EXCEPTION 'Estado inválido.' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id) FROM (
  SELECT r.*,coalesce(a.name,'Conta excluída') reporter_name,coalesce(b.name,'Conta excluída') target_name,
   coalesce((SELECT restricted FROM public.mentor_restrictions WHERE user_id=r.target_id),false) target_restricted
  FROM public.mentor_reports r LEFT JOIN public.mentor_profiles a ON a.id=r.reporter_id LEFT JOIN public.mentor_profiles b ON b.id=r.target_id
  WHERE r.status=p_status ORDER BY r.created_at,r.id LIMIT 200
 ) q),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_moderate(p_report uuid,p_status text,p_action text DEFAULT 'none',p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); r public.mentor_reports; n text:=regexp_replace(p_note,'^[[:space:]]+|[[:space:]]+$','','g'); safe_note text;
BEGIN
 IF NOT public.mentor_moderation_access() THEN RAISE EXCEPTION 'Acesso de moderação obrigatório.' USING ERRCODE='42501'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('reviewed','dismissed') OR p_action IS NULL OR p_action NOT IN ('none','restrict','restore')
  OR n IS NULL OR length(n)>2000 OR (p_action<>'none' AND length(n)<10)
  OR (p_status='dismissed' AND p_action='restrict') THEN RAISE EXCEPTION 'Decisão ou justificativa inválida.' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.mentor_reports WHERE id=p_report;
 IF NOT FOUND THEN RAISE EXCEPTION 'Denúncia indisponível.' USING ERRCODE='42501'; END IF;
 IF u IN (r.reporter_id,r.target_id) THEN RAISE EXCEPTION 'Outro moderador deve analisar esta denúncia.' USING ERRCODE='42501'; END IF;
 PERFORM public.mentor__lock(u,r.target_id);
 -- This row lock also serializes role revocation by the administrative tool.
 PERFORM 1 FROM public.mentor_moderators WHERE user_id=u FOR SHARE;
 IF NOT public.mentor_moderation_access() THEN RAISE EXCEPTION 'Acesso de moderação obrigatório.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.mentor_reports WHERE id=p_report FOR UPDATE;
 IF p_action<>'none' AND r.target_id IS NULL THEN RAISE EXCEPTION 'Conta excluída; somente encerramento sem ação é permitido.' USING ERRCODE='22023'; END IF;
 IF p_action<>'none' THEN
  INSERT INTO public.mentor_restrictions(user_id,restricted) VALUES(r.target_id,p_action='restrict')
   ON CONFLICT(user_id) DO UPDATE SET restricted=excluded.restricted,updated_at=clock_timestamp();
 END IF;
 INSERT INTO public.mentor_moderation_audit(report_id,moderator_id,target_id,previous_status,status,action,note)
 VALUES(r.id,u,r.target_id,r.status,p_status,p_action,n);
 -- Never expose internal moderator notes or account enforcement details to reporters.
 safe_note:=CASE WHEN p_status='reviewed' THEN 'Denúncia analisada pela moderação.' ELSE 'Denúncia encerrada após análise.' END;
 UPDATE public.mentor_reports SET status=p_status,resolved_at=clock_timestamp(),resolution_note=safe_note WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'action',p_action,'resolved_at',r.resolved_at,'resolution_note',r.resolution_note);
END $$;
CREATE OR REPLACE FUNCTION public.mentor_product__immutable_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Histórico de moderação imutável.' USING ERRCODE='42501'; END $$;
DROP TRIGGER IF EXISTS mentor_audit_immutable ON public.mentor_moderation_audit;
CREATE TRIGGER mentor_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.mentor_moderation_audit
 FOR EACH STATEMENT EXECUTE FUNCTION public.mentor_product__immutable_audit();

REVOKE ALL ON FUNCTION public.mentor_product__slots(text[]),public.mentor_product__visible(uuid,uuid),public.mentor_product__learner_match(uuid,uuid,text),public.mentor_product__immutable_audit(),
 public.mentor__eligible(uuid),public.mentor__profile(public.mentor_profiles),public.mentor__request(public.mentor_requests) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mentor_save_product(jsonb,text),public.mentor_discover_product(text,text,integer,text,text,boolean),
 public.mentor_favorites(),public.mentor_favorite(uuid,boolean),public.mentor_request_product(uuid,text,text,text,timestamptz),
 public.mentor_report(uuid,text,text),public.mentor_my_reports(),public.mentor_moderation_access(),
 public.mentor_moderation_queue(text),public.mentor_moderate(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_save_product(jsonb,text),public.mentor_discover_product(text,text,integer,text,text,boolean),
 public.mentor_favorites(),public.mentor_favorite(uuid,boolean),public.mentor_request_product(uuid,text,text,text,timestamptz),
 public.mentor_report(uuid,text,text),public.mentor_my_reports(),public.mentor_moderation_access(),
 public.mentor_moderation_queue(text),public.mentor_moderate(uuid,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
