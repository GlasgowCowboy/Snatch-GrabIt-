-- Backfill games.started_at for historical rows whose value is broken or NULL.
--
-- Context: before the started_at lifecycle was wired up (now stamped in
-- RoomManager.startGame), games rows had started_at either:
--   * Filled by defaultNow() at INSERT time, after a JS-side finished_at was
--     captured → started_at > finished_at by the round-trip latency (~25ms).
--   * 1 hour off, when finished_at was a JS Date written into a naive timestamp
--     column before the timestamptz fix.
-- Post-fix, rows whose game finalized without ever going through startGame
-- (e.g. legacy code paths) have started_at IS NULL.
--
-- For both cases we have no better signal for the true start time, so we clamp
-- started_at = finished_at. The invariant `finished_at >= started_at` then
-- holds for every finalized row, with `finished_at - started_at = 0` flagging
-- "unknown duration" to any downstream analytics.
--
-- Safe to run repeatedly: the WHERE clause excludes already-correct rows.

BEGIN;

UPDATE games
SET started_at = finished_at
WHERE finished_at IS NOT NULL
  AND (started_at IS NULL OR started_at > finished_at);

-- Sanity check: should return 0 if backfill worked.
SELECT COUNT(*) AS rows_still_inverted_or_null_after_backfill
FROM games
WHERE finished_at IS NOT NULL
  AND (started_at IS NULL OR started_at > finished_at);

COMMIT;
