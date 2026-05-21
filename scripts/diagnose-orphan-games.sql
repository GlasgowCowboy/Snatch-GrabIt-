-- Diagnostic: count "orphan" games rows on prod.
--
-- Context: createRoom (server/rooms.ts) pre-creates a games row so virtual_bets
-- placed during the lobby have a real FK target. If the room never reaches
-- gameOver — host abandons before startGame, all players leave, the in-memory
-- room TTL (6h) evicts the room — that stub row is never cleaned up.
--
-- An orphan is a games row with:
--   * started_at IS NULL (startGame never fired)
--   * finished_at IS NULL (game never finalized)
--   * no participants (game never finalized — finalize is the only writer)
--   * no bets (no lobby-time betting activity attached either)
--
-- Read-only. Run this against prod first to size the problem before deciding
-- on a cleanup strategy (TTL sweep job, deferred row creation, accept the leak).

-- Overall count + age distribution
SELECT
  COUNT(*) AS orphan_count,
  MIN(g.started_at)  AS oldest_started_at,   -- should be NULL
  MIN(g.finished_at) AS oldest_finished_at   -- should be NULL
FROM games g
WHERE g.started_at IS NULL
  AND g.finished_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM virtual_bets       b WHERE b.game_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM game_participants  p WHERE p.game_id = g.id);

-- Sanity: how many games rows total exist on prod, by status bucket?
SELECT
  COUNT(*)                                                       AS total,
  COUNT(*) FILTER (WHERE started_at IS NULL AND finished_at IS NULL) AS never_started_never_finished,
  COUNT(*) FILTER (WHERE started_at IS NOT NULL AND finished_at IS NULL) AS started_not_finished,
  COUNT(*) FILTER (WHERE started_at IS NULL AND finished_at IS NOT NULL) AS finished_no_start,
  COUNT(*) FILTER (WHERE started_at IS NOT NULL AND finished_at IS NOT NULL) AS started_and_finished
FROM games;
