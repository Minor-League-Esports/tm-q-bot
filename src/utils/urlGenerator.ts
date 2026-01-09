import { config } from '../config.js';
import { WebAppUrlData } from '../types.js';

/**
 * Utility for generating Google AppScript Web App URLs
 */
export class UrlGenerator {
  /**
   * Generate a standard Web App URL for a scrim
   */
  static generateWebAppUrl(data: WebAppUrlData): string {
    const baseUrl = config.appScript.baseUrl;
    const params = new URLSearchParams();

    // Add scrim ID
    params.append('scrimId', data.scrimId);

    // Add player names (comma-separated)
    params.append('players', data.players.join(','));

    // Add maps (comma-separated)
    params.append('maps', data.maps.join(','));

    // Add timestamp
    params.append('timestamp', data.timestamp);

    // Build the simple URL
    const url = `${baseUrl}?${params.toString()}`;
    return url;
  }

  /**
   * Format a timestamp for the URL (ISO 8601)
   */
  static formatTimestamp(date: Date): string {
    return date.toISOString();
  }

  /**
   * Create data structure for URL generation
   */
  static createUrlData(
    scrimId: string,
    playerNames: string[],
    mapNames: string[],
    timestamp?: Date,
  ): WebAppUrlData {
    return {
      scrimId,
      players: playerNames,
      maps: mapNames,
      timestamp: this.formatTimestamp(timestamp || new Date()),
    };
  }
}
