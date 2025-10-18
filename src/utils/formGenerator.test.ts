import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormGenerator } from './formGenerator.js';
import { FormData } from '../types.js';

// Mock config
vi.mock('../config.js', () => ({
  config: {
    googleForms: {
      baseUrl: 'https://docs.google.com/forms/d/e/TEST_FORM_ID/viewform',
      scrimIdEntry: 'entry.123456',
      playersEntry: 'entry.789012',
      timestampEntry: 'entry.345678',
      mapsEntry: 'entry.901234',
    },
  },
}));

describe('FormGenerator', () => {
  describe('generateFormUrl', () => {
    it('should generate a valid pre-filled form URL', () => {
      const formData: FormData = {
        scrimId: 'SCRIM-ABC123',
        players: ['Player1', 'Player2', 'Player3', 'Player4'],
        maps: ['Trial of the Fool', 'Speed Demon', 'Tech Master'],
        timestamp: '2025-01-01T12:00:00.000Z',
      };

      const url = FormGenerator.generateFormUrl(formData);

      expect(url).toContain('https://docs.google.com/forms/d/e/TEST_FORM_ID/viewform');
      expect(url).toContain('entry.123456=SCRIM-ABC123');
      expect(url).toContain('entry.789012=Player1%2C+Player2%2C+Player3%2C+Player4');
      expect(url).toContain('entry.901234=Trial+of+the+Fool%2C+Speed+Demon%2C+Tech+Master');
      expect(url).toContain('entry.345678=2025-01-01T12%3A00%3A00.000Z');
    });

    it('should handle special characters in player names', () => {
      const formData: FormData = {
        scrimId: 'SCRIM-XYZ789',
        players: ['Player&One', 'Player Two', 'Player#3', 'Player@4'],
        maps: ['Map 1', 'Map 2', 'Map 3'],
        timestamp: '2025-01-01T12:00:00.000Z',
      };

      const url = FormGenerator.generateFormUrl(formData);

      // URLSearchParams should properly encode special characters
      expect(url).toContain('Player%26One');
      expect(url).toContain('Player+Two');
      expect(url).toContain('Player%233');
      expect(url).toContain('Player%404');
    });
  });

  describe('formatTimestamp', () => {
    it('should format date as ISO 8601 string', () => {
      const date = new Date('2025-01-01T12:00:00.000Z');
      const formatted = FormGenerator.formatTimestamp(date);

      expect(formatted).toBe('2025-01-01T12:00:00.000Z');
    });
  });

  describe('createFormData', () => {
    it('should create FormData object with correct structure', () => {
      const scrimId = 'SCRIM-TEST';
      const playerNames = ['P1', 'P2', 'P3', 'P4'];
      const mapNames = ['M1', 'M2', 'M3'];
      const timestamp = new Date('2025-01-01T12:00:00.000Z');

      const formData = FormGenerator.createFormData(scrimId, playerNames, mapNames, timestamp);

      expect(formData.scrimId).toBe(scrimId);
      expect(formData.players).toEqual(playerNames);
      expect(formData.maps).toEqual(mapNames);
      expect(formData.timestamp).toBe('2025-01-01T12:00:00.000Z');
    });

    it('should use current time if no timestamp provided', () => {
      const scrimId = 'SCRIM-TEST';
      const playerNames = ['P1', 'P2', 'P3', 'P4'];
      const mapNames = ['M1', 'M2', 'M3'];

      const beforeCall = new Date();
      const formData = FormGenerator.createFormData(scrimId, playerNames, mapNames);
      const afterCall = new Date();

      const timestampDate = new Date(formData.timestamp);

      expect(timestampDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(timestampDate.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });
});
