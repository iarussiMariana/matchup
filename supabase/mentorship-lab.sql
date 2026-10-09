-- Laboratory reset for the current academic app. No reset is executed by this migration.
-- Requires deployed core, academic and product migrations; never replays them.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$ BEGIN
 IF to_regclass('public.mentor_restrictions') IS NULL
 OR position('mentor_restrictions' IN pg_get_functiondef('public.mentor_actor()'::regprocedure))=0 THEN
  RAISE EXCEPTION 'Product restrictions prerequisite missing';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mentor_reset_connections(p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
 u uuid := public.mentor_ac__actor();
 requests uuid[]; sessions uuid[]; messages uuid[]; materials uuid[];
 request_count integer; review_count integer;
BEGIN
 IF p_confirmation IS DISTINCT FROM 'RESETAR' THEN
  RAISE EXCEPTION 'Confirmação explícita obrigatória.' USING ERRCODE = '22023';
 END IF;
 -- Every request/chat/session mutation involving this account shares this lock.
 PERFORM public.mentor__lock(u);
 PERFORM public.mentor_ac__actor();
 SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO requests
 FROM public.mentor_requests WHERE learner_id=u OR mentor_id=u;
 SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO sessions
 FROM public.mentor_study_sessions WHERE request_id=ANY(requests);
 SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO messages
 FROM public.mentor_messages WHERE request_id=ANY(requests);
 SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO materials
 FROM public.mentor_materials WHERE request_id=ANY(requests);
 SELECT count(*)::integer INTO review_count
 FROM public.mentor_session_reviews WHERE session_id=ANY(sessions);

 DELETE FROM public.mentor_notification_reads
 WHERE (split_part(notification_id, ':', 1) IN ('request','accepted') AND split_part(notification_id, ':', 2)=ANY(requests::text[]))
    OR (split_part(notification_id, ':', 1)='message' AND split_part(notification_id, ':', 2)=ANY(messages::text[]))
    OR (split_part(notification_id, ':', 1)='file' AND split_part(notification_id, ':', 2)=ANY(materials::text[]))
    OR (split_part(notification_id, ':', 1) IN ('session','upcoming') AND split_part(notification_id, ':', 2)=ANY(sessions::text[]));
 -- Cascades remove only these connections' messages, sessions, participants, reviews
 -- and material metadata. Storage objects are not directly deleted through SQL.
 DELETE FROM public.mentor_requests WHERE id=ANY(requests) AND (learner_id=u OR mentor_id=u);
 GET DIAGNOSTICS request_count = ROW_COUNT;
 RETURN jsonb_build_object('reset',true,'requests',request_count,'messages',cardinality(messages),
   'sessions',cardinality(sessions),'materials',cardinality(materials),'reviews',review_count);
END $$;
REVOKE ALL ON FUNCTION public.mentor_reset_connections(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_reset_connections(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
