import { config } from '../config.js';
import { FormData } from '../types.js';

/**
 * Utility for generating pre-filled Google Form URLs
 */
export class FormGenerator {
  /**
   * Generate a pre-filled Google Form URL for a scrim
   */
  static generateFormUrl(data: FormData): string {
    const baseUrl = config.googleForms.baseUrl;
    const params = new URLSearchParams();

    // Add scrim ID
    params.append(config.googleForms.scrimIdEntry, data.scrimId);

    // Add player names (comma-separated)
    params.append(config.googleForms.playersEntry, data.players.join(', '));

    // Add maps (comma-separated)
    params.append(config.googleForms.mapsEntry, data.maps.join(', '));

    // Add timestamp
    params.append(config.googleForms.timestampEntry, data.timestamp);

    const url = `${baseUrl}?${params.toString()}`;
    return url;
  }

  /**
   * Format a timestamp for the form (ISO 8601)
   */
  static formatTimestamp(date: Date): string {
    return date.toISOString();
  }

  /**
   * Create form data from scrim information
   */
  static createFormData(
    scrimId: string,
    playerNames: string[],
    mapNames: string[],
    timestamp?: Date
  ): FormData {
    return {
      scrimId,
      players: playerNames,
      maps: mapNames,
      timestamp: this.formatTimestamp(timestamp || new Date()),
    };
  }
}
