-- Sample data for development and testing

-- Sample maps (typical Trackmania campaign maps)
INSERT INTO maps (name, uid, author, is_active) VALUES
('Trial of the Fool', 'TM_TRIAL_01_AAAA', 'Nadeo', true),
('Speed Demon', 'TM_SPEED_02_BBBB', 'Nadeo', true),
('Tech Master', 'TM_TECH_03_CCCC', 'Nadeo', true),
('Ice Paradise', 'TM_ICE_04_DDDD', 'Nadeo', true),
('Dirt Rally', 'TM_DIRT_05_EEEE', 'Nadeo', true),
('Full Speed Ahead', 'TM_FS_06_FFFF', 'Nadeo', true),
('Plastic Canyon', 'TM_PLAST_07_GGGG', 'Nadeo', true),
('Rocky Road', 'TM_ROCK_08_HHHH', 'Nadeo', true),
('Water World', 'TM_WATER_09_IIII', 'Nadeo', true),
('Sky High', 'TM_SKY_10_JJJJ', 'Nadeo', true),
('Mixed Master', 'TM_MIX_11_KKKK', 'Nadeo', true),
('Loop de Loop', 'TM_LOOP_12_LLLL', 'Nadeo', true),
('Icy Descent', 'TM_ICYD_13_MMMM', 'Nadeo', true),
('Dirt Devil', 'TM_DEVIL_14_NNNN', 'Nadeo', true),
('Speed Circuit', 'TM_CIRC_15_OOOO', 'Nadeo', true)
ON CONFLICT (uid) DO NOTHING;

-- Sample players (for testing only - remove in production)
-- These are example Discord IDs (not real)
INSERT INTO players (discord_id, discord_username, league) VALUES
('123456789012345678', 'TestPlayer1', 'Academy'),
('234567890123456789', 'TestPlayer2', 'Academy'),
('345678901234567890', 'TestPlayer3', 'Champion'),
('456789012345678901', 'TestPlayer4', 'Champion'),
('567890123456789012', 'TestPlayer5', 'Master'),
('678901234567890123', 'TestPlayer6', 'Master')
ON CONFLICT (discord_id) DO NOTHING;

-- Sample map play history (for testing map selection algorithm)
-- Generate some play history for the test players
DO $$
DECLARE
    player_record RECORD;
    map_record RECORD;
    play_date TIMESTAMP;
BEGIN
    FOR player_record IN SELECT id FROM players LIMIT 6 LOOP
        FOR map_record IN SELECT id FROM maps ORDER BY RANDOM() LIMIT 8 LOOP
            FOR i IN 1..FLOOR(RANDOM() * 5 + 1)::INTEGER LOOP
                play_date := NOW() - (RANDOM() * INTERVAL '14 days');
                INSERT INTO map_play_history (player_id, map_id, played_at)
                VALUES (player_record.id, map_record.id, play_date);
            END LOOP;
        END LOOP;
    END LOOP;
END $$;
