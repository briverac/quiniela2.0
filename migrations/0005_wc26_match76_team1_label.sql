-- Match 76 R32: bracket slot is 1C vs 2F (was incorrectly 1E; duplicate 1E vs 3ABCDF elsewhere).
UPDATE matches
SET
  team1_label = '1C',
  updated_at = datetime('now')
WHERE
  tournament_id = (SELECT id FROM tournaments WHERE code = 'WC26' LIMIT 1)
  AND number = 76;
