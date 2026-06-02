-- Penalty shootout scores (knockout only); FT scores remain 90'+ET for points.
ALTER TABLE matches ADD COLUMN team1_pen_score INTEGER;
ALTER TABLE matches ADD COLUMN team2_pen_score INTEGER;
