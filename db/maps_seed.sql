CREATE SCHEMA IF NOT EXISTS trackmania;
SET search_path TO trackmania, public;

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
