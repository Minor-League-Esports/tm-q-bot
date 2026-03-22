import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ButtonStyle } from 'discord.js';
import {
  buildCheckInActionRow,
  performCheckIn,
} from './checkinInteractions.js';
import { playerService } from '../services/player.service.js';
import { scrimService } from '../services/scrim.service.js';
import { Player, Scrim } from '../types.js';

vi.mock('../services/player.service.js');
vi.mock('../services/scrim.service.js');
vi.mock('../utils/logger.js');

describe('checkinInteractions', () => {
  const mockPlayer: Player = {
    id: 42,
    discord_id: '123456789',
    discord_username: 'testuser',
    league: 'Master',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockScrim: Scrim = {
    id: 99,
    scrim_uid: 'SCRIM-99',
    league: 'Master',
    status: 'checking_in',
    match_type: 'QUEUE',
    winner_team: null,
    elo_processed: false,
    checkin_deadline: new Date(Date.now() + 5 * 60 * 1000),
    completed_at: null,
    created_at: new Date(),
    sprocket_match_parent_id: null,
    sprocket_match_id: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(playerService.getByDiscordId).mockResolvedValue(mockPlayer);
    vi.mocked(scrimService.getPlayerRecentScrims).mockResolvedValue([mockScrim]);
    vi.mocked(scrimService.isCheckInExpired).mockResolvedValue(false);
    vi.mocked(scrimService.checkInPlayer).mockResolvedValue(true);
    vi.mocked(scrimService.areAllPlayersCheckedIn).mockResolvedValue(false);
  });

  it('builds a DM-safe check-in button row', () => {
    const row = buildCheckInActionRow();
    const json = row.toJSON();

    expect(json.components).toHaveLength(1);
    expect(json.components[0]).toMatchObject({
      custom_id: 'queue-pop-checkin',
      label: 'Check in now',
      style: ButtonStyle.Success,
      disabled: false,
    });
  });

  it('disables the check-in button when requested', () => {
    const row = buildCheckInActionRow(true);
    const json = row.toJSON();

    expect(json.components[0]).toMatchObject({
      custom_id: 'queue-pop-checkin',
      label: 'Checked in',
      disabled: true,
    });
  });

  it('checks a player in and returns the pending status message', async () => {
    const result = await performCheckIn(mockPlayer.discord_id);

    expect(result).toMatchObject({
      success: true,
      scrimUid: 'SCRIM-99',
      allCheckedIn: false,
    });
    expect(result.message).toContain('Waiting for other players');
    expect(scrimService.checkInPlayer).toHaveBeenCalledWith(mockScrim.id, mockPlayer.id);
  });

  it('returns the active message when the last player checks in', async () => {
    vi.mocked(scrimService.areAllPlayersCheckedIn).mockResolvedValue(true);

    const result = await performCheckIn(mockPlayer.discord_id);

    expect(result).toMatchObject({
      success: true,
      scrimUid: 'SCRIM-99',
      allCheckedIn: true,
    });
    expect(result.message).toContain('is now active');
  });

  it('returns a helpful error when the player is not in an active scrim', async () => {
    vi.mocked(scrimService.getPlayerRecentScrims).mockResolvedValue([]);

    const result = await performCheckIn(mockPlayer.discord_id);

    expect(result).toMatchObject({
      success: false,
      message: 'You are not in an active scrim waiting for check-in.',
    });
  });
});
