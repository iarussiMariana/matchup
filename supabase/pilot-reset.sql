-- Spark pilot: apply after mvp-fixes.sql. Safe to reapply; installation resets nobody.
-- RPC: reset_my_test_activity({ reset_mode: 'nope' | 'all' }); default 'all'.
-- 'nope' deletes outgoing nopes only, with no notification/chat changes.
-- 'all' deletes every outgoing swipe and both sides of existing match pairs (even
-- inactive/reversed pairs), their chat and obsolete relationship notifications.
-- Unmatched incoming swipes/likes, system notices and moderation/profile data survive.
-- Counts are deleted rows: outgoing_swipes, reciprocal_swipes, matches, messages,
-- notifications; mode echoes the validated mode. Repeating a reset returns zeros.
-- Test: node tests/backend-reset.js (only disposable fixtures).
BEGIN;

CREATE OR REPLACE FUNCTION public.reset_my_test_activity(reset_mode TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  caller UUID := auth.uid();
  match_ids UUID[];
  matched_peers UUID[];
  outgoing_peers UUID[];
  outgoing_count BIGINT := 0;
  reciprocal_count BIGINT := 0;
  match_count BIGINT := 0;
  message_count BIGINT := 0;
  notification_count BIGINT := 0;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF reset_mode IS NULL OR reset_mode NOT IN ('nope', 'all') THEN
    RAISE EXCEPTION 'Invalid reset mode: expected nope or all' USING ERRCODE = '22023';
  END IF;

  -- The existing AFTER INSERT swipe trigger takes pair advisory locks only after
  -- inserting. Taking those here could deadlock against that uncommitted insert.
  -- A short write lock drains swipe transactions BEFORE we snapshot any pairs and
  -- serializes resets without changing normal swipe behavior. Reads stay available.
  -- Pilot tradeoff: all swipe writes briefly wait; contention fails atomically after
  -- 5 seconds (55P03), so clients can retry. Do not wrap this RPC in a long transaction.
  LOCK TABLE public.swipes IN SHARE ROW EXCLUSIVE MODE;

  IF reset_mode = 'nope' THEN
    DELETE FROM public.swipes WHERE swiper_id = caller AND direction = 'nope';
    GET DIAGNOSTICS outgoing_count = ROW_COUNT;
  ELSE
    -- Row locks also drain existing chat writes via their match foreign key and
    -- prevent new messages from surviving deletion of their conversation.
    PERFORM m.id FROM public.matches m
      WHERE caller IN (m.user1_id, m.user2_id) ORDER BY m.id FOR UPDATE;
    SELECT COALESCE(array_agg(m.id), ARRAY[]::UUID[]),
      COALESCE(array_agg(CASE WHEN m.user1_id = caller THEN m.user2_id ELSE m.user1_id END), ARRAY[]::UUID[])
      INTO match_ids, matched_peers
      FROM public.matches m WHERE caller IN (m.user1_id, m.user2_id);
    SELECT COALESCE(array_agg(s.swiped_id), ARRAY[]::UUID[])
      INTO outgoing_peers FROM public.swipes s WHERE s.swiper_id = caller;

    DELETE FROM public.swipes WHERE swiper_id = caller;
    GET DIAGNOSTICS outgoing_count = ROW_COUNT;
    DELETE FROM public.swipes WHERE swiped_id = caller AND swiper_id = ANY(matched_peers);
    GET DIAGNOSTICS reciprocal_count = ROW_COUNT;

    DELETE FROM public.messages WHERE match_id = ANY(match_ids);
    GET DIAGNOSTICS message_count = ROW_COUNT;
    DELETE FROM public.matches WHERE id = ANY(match_ids);
    GET DIAGNOSTICS match_count = ROW_COUNT;

    -- Notifications carry peer IDs, not match IDs. Remove both directions for
    -- deleted conversations, but only outgoing-like notices for unmatched swipes.
    DELETE FROM public.notifications n WHERE
      (n.type IN ('like', 'super_like', 'match', 'message') AND
        ((n.user_id = caller AND n.related_user_id = ANY(matched_peers)) OR
         (n.related_user_id = caller AND n.user_id = ANY(matched_peers))))
      OR (n.type IN ('like', 'super_like') AND n.related_user_id = caller
        AND n.user_id = ANY(outgoing_peers));
    GET DIAGNOSTICS notification_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('mode', reset_mode, 'outgoing_swipes', outgoing_count,
    'reciprocal_swipes', reciprocal_count, 'matches', match_count,
    'messages', message_count, 'notifications', notification_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_my_test_activity(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reset_my_test_activity(TEXT) TO authenticated;
COMMENT ON FUNCTION public.reset_my_test_activity(TEXT) IS
  'Pilot self-only reset: nope removes outgoing nopes; all clears outgoing swipes and existing match pairs/chat. Preserves blocks, reports and profiles. Counts describe deleted rows.';
NOTIFY pgrst, 'reload schema';
COMMIT;
