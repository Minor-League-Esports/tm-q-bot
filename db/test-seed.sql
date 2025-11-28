-- Test Seed Data

-- Insert 4 Academy Players
INSERT INTO players (discord_id, discord_username, league) VALUES
('test_discord_id_1', 'TestPlayer1', 'Academy'),
('test_discord_id_2', 'TestPlayer2', 'Academy'),
('test_discord_id_3', 'TestPlayer3', 'Academy'),
('test_discord_id_4', 'TestPlayer4', 'Academy');

-- Insert 10 Test Maps
INSERT INTO maps (name, uid, author, is_active) VALUES
('Test Map 1', 'test_uid_1', 'TestAuthor', true),
('Test Map 2', 'test_uid_2', 'TestAuthor', true),
('Test Map 3', 'test_uid_3', 'TestAuthor', true),
('Test Map 4', 'test_uid_4', 'TestAuthor', true),
('Test Map 5', 'test_uid_5', 'TestAuthor', true),
('Test Map 6', 'test_uid_6', 'TestAuthor', true),
('Test Map 7', 'test_uid_7', 'TestAuthor', true),
('Test Map 8', 'test_uid_8', 'TestAuthor', true),
('Test Map 9', 'test_uid_9', 'TestAuthor', true),
('Test Map 10', 'test_uid_10', 'TestAuthor', true);