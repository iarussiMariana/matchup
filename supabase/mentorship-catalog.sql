-- Additive FACENS catalog. Apply with tools/deploy-catalog.cjs after core + academic migrations.
-- Tables retain retired entries; only the current verified snapshot is exposed.
BEGIN;
SET LOCAL lock_timeout = '10s';

-- Widen discipline names only. Guard each exact fragment so unknown deployed versions
-- fail atomically instead of replacing an entire RPC or weakening unrelated validation.
DO $catalog_limits$
DECLARE r record; v_oid oid; v_definition text; v_count integer; v_expected text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.mentor_save(jsonb)',
      $old$length(v_text) NOT BETWEEN 1 AND 80$old$,
      $new$length(v_text) NOT BETWEEN 1 AND (CASE WHEN v_key = 'topics' THEN 80 ELSE 256 END)$new$),
    ('public.mentor_discover(text)', $old$length(p_subject) > 80$old$, $new$length(p_subject) > 256$new$),
    ('public.mentor_request(uuid,text)',
      $old$length(btrim(p_subject)) NOT BETWEEN 1 AND 80$old$,
      $new$length(btrim(p_subject)) NOT BETWEEN 1 AND 256$new$),
    ('public.mentor_group_create(jsonb)',
      $old$public.mentor_ac__text(p_group,'subject',80,true)$old$,
      $new$public.mentor_ac__text(p_group,'subject',256,true)$new$),
    ('public.mentor_session_save(jsonb)',
      $old$public.mentor_ac__text(p_session,'subject',80,true)$old$,
      $new$public.mentor_ac__text(p_session,'subject',256,true)$new$)
  ) AS patches(signature,old_fragment,new_fragment) LOOP
    v_oid := to_regprocedure(r.signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Catalog prerequisite missing: %', r.signature; END IF;
    v_definition := pg_get_functiondef(v_oid);
    v_count := (length(v_definition)-length(replace(v_definition,r.old_fragment,'')))/length(r.old_fragment);
    IF v_count=1 AND strpos(v_definition,r.new_fragment)=0 THEN
      EXECUTE replace(v_definition,r.old_fragment,r.new_fragment);
    ELSIF v_count<>0 OR
      (length(v_definition)-length(replace(v_definition,r.new_fragment,'')))/length(r.new_fragment)<>1 THEN
      RAISE EXCEPTION 'Unexpected subject validation in %. Review migration before deploying.', r.signature;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('public.mentor_requests','mentor_requests_subject_check','btrim(subject)'),
    ('public.mentor_study_groups','mentor_study_groups_subject_check','subject'),
    ('public.mentor_study_sessions','mentor_study_sessions_subject_check','subject')
  ) AS checks(relation,constraint_name,expression) LOOP
    SELECT pg_get_constraintdef(c.oid) INTO v_definition FROM pg_constraint c
      WHERE c.conrelid=to_regclass(r.relation) AND c.conname=r.constraint_name AND c.contype='c';
    v_expected := format('CHECK (((length(%s) >= 1) AND (length(%s) <= 80)))',r.expression,r.expression);
    IF v_definition=v_expected THEN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.relation,r.constraint_name);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.relation,r.constraint_name,replace(v_expected,'<= 80','<= 256'));
    ELSIF v_definition IS DISTINCT FROM replace(v_expected,'<= 80','<= 256') THEN
      RAISE EXCEPTION 'Unexpected subject constraint %. Review migration before deploying.', r.constraint_name;
    END IF;
  END LOOP;
END;
$catalog_limits$;

CREATE TABLE IF NOT EXISTS public.mentor_catalog_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  institution text NOT NULL CHECK (length(btrim(institution)) > 0),
  checked_at date NOT NULL,
  source_url text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mentor_catalog_courses (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  degree text NOT NULL,
  modality text NOT NULL,
  source_url text NOT NULL,
  curriculum_source_url text,
  curriculum_version text,
  curriculum_status text NOT NULL CHECK (curriculum_status IN ('complete','partial','unavailable')),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.mentor_catalog_subjects (
  name text PRIMARY KEY CHECK (length(btrim(name)) > 0)
);
CREATE TABLE IF NOT EXISTS public.mentor_catalog_course_subjects (
  course_id text NOT NULL REFERENCES public.mentor_catalog_courses(id),
  subject_name text NOT NULL REFERENCES public.mentor_catalog_subjects(name),
  semester integer NOT NULL DEFAULT 0 CHECK (semester BETWEEN 0 AND 20),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (course_id, subject_name, semester)
);
ALTER TABLE public.mentor_profiles ADD COLUMN IF NOT EXISTS catalog_course_id text
  REFERENCES public.mentor_catalog_courses(id);
ALTER TABLE public.mentor_catalog_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_catalog_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_catalog_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_catalog_course_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_catalog_metadata, public.mentor_catalog_courses,
  public.mentor_catalog_subjects, public.mentor_catalog_course_subjects FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mentor__profile(p public.mentor_profiles)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'course', p.course, 'semester', p.semester,
    'bio', p.bio, 'subjects', p.subjects, 'learning_subjects', p.learning_subjects,
    'availability', p.availability, 'format', p.format, 'photo_url', p.photo_url, 'active', p.active,
    'institution', p.institution, 'city', p.city, 'current_subjects', p.current_subjects,
    'topics', p.topics, 'study_preference', p.study_preference, 'catalog_course_id', p.catalog_course_id);
$$;
CREATE OR REPLACE FUNCTION public.mentor_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.mentor__actor();
  RETURN (SELECT jsonb_build_object('institution', m.institution, 'checked_at', m.checked_at,
    'source_url', m.source_url, 'courses', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'degree', c.degree,
        'modality', c.modality, 'source_url', c.source_url, 'curriculum_source_url', c.curriculum_source_url,
        'curriculum_version', c.curriculum_version, 'curriculum_status', c.curriculum_status,
        'subjects', coalesce((SELECT jsonb_agg(jsonb_build_object('name', s.subject_name,
          'semester', nullif(s.semester, 0)) ORDER BY s.semester, s.subject_name COLLATE "C")
          FROM public.mentor_catalog_course_subjects s WHERE s.course_id=c.id AND s.active), '[]'::jsonb))
        ORDER BY c.id COLLATE "C") FROM public.mentor_catalog_courses c WHERE c.active), '[]'::jsonb))
    FROM public.mentor_catalog_metadata m WHERE m.singleton);
END;
$$;

CREATE OR REPLACE FUNCTION public.mentor_save_catalog(p_profile jsonb, p_course_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := public.mentor__actor();
  v_old public.mentor_profiles;
  v_course public.mentor_catalog_courses;
  v_exists boolean;
  v_key text;
  v_item jsonb;
  v_text text;
  v_legacy text[];
  v_values jsonb;
  v_result public.mentor_profiles;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mentor__lock(v_uid);
  SELECT * INTO v_old FROM public.mentor_profiles WHERE id=v_uid;
  v_exists := FOUND;
  IF p_course_id IS NULL THEN
    IF NOT v_exists OR v_old.catalog_course_id IS NOT NULL
      OR jsonb_typeof(p_profile->'course') IS DISTINCT FROM 'string'
      OR (p_profile->>'course') IS DISTINCT FROM v_old.course THEN
      RAISE EXCEPTION 'Selecione um curso oficial.' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT * INTO v_course FROM public.mentor_catalog_courses WHERE id=p_course_id AND active;
    IF NOT FOUND OR jsonb_typeof(p_profile->'course') IS DISTINCT FROM 'string'
      OR (p_profile->>'course') IS DISTINCT FROM v_course.name THEN
      RAISE EXCEPTION 'Curso oficial inválido.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Grandfather only exact values in the same saved array, never another user's data.
  -- Omitted current_subjects preserves mentor_save's backwards-compatible default.
  FOREACH v_key IN ARRAY ARRAY['subjects','learning_subjects','current_subjects'] LOOP
    v_legacy := CASE v_key WHEN 'subjects' THEN v_old.subjects
      WHEN 'learning_subjects' THEN v_old.learning_subjects ELSE v_old.current_subjects END;
    v_values := CASE WHEN v_key='current_subjects' AND NOT (p_profile ? v_key)
      THEN to_jsonb(coalesce(v_legacy, '{}'::text[])) ELSE p_profile->v_key END;
    IF jsonb_typeof(v_values) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Lista de matérias inválida.' USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_values) LOOP
      IF jsonb_typeof(v_item) <> 'string' THEN
        RAISE EXCEPTION 'Matéria oficial inválida.' USING ERRCODE = '22023';
      END IF;
      v_text := v_item #>> '{}';
      IF NOT (v_exists AND v_text = ANY(coalesce(v_legacy, '{}'::text[])))
        AND NOT EXISTS (SELECT 1 FROM public.mentor_catalog_course_subjects s
          JOIN public.mentor_catalog_courses c ON c.id=s.course_id AND c.active
          WHERE s.active AND s.subject_name=v_text
            AND (v_key <> 'current_subjects' OR s.course_id=p_course_id)) THEN
        RAISE EXCEPTION 'Selecione uma matéria oficial; matérias antigas podem apenas ser mantidas ou removidas.'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  -- The catalog id is a separate RPC parameter, not part of the legacy save contract.
  IF p_profile ? 'catalog_course_id' AND
    (p_profile->'catalog_course_id') IS DISTINCT FROM coalesce(to_jsonb(p_course_id), 'null'::jsonb) THEN
    RAISE EXCEPTION 'Identificador de curso divergente.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mentor_save(p_profile - 'catalog_course_id');
  UPDATE public.mentor_profiles SET catalog_course_id=p_course_id WHERE id=v_uid RETURNING * INTO v_result;
  RETURN public.mentor__profile(v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.mentor__profile(public.mentor_profiles) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mentor_catalog(), public.mentor_save_catalog(jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_catalog(), public.mentor_save_catalog(jsonb,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
