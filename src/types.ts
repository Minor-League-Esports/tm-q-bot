// Core domain types

export type League = 'Academy' | 'Champion' | 'Master';

export type ScrimStatus = 'checking_in' | 'active' | 'completed' | 'cancelled';

export type MatchType = 'QUEUE' | 'SCHEDULED';

export interface Player {
  id: number;
  discord_id: string;
  discord_username: string;
  league: League;
  created_at: Date;
  updated_at: Date;
}

export interface QueueBan {
  id: number;
  player_id: number;
  ban_start: Date;
  ban_end: Date;
  reason: string;
  dodge_count: number;
  is_manual: boolean;
  created_at: Date;
}

export interface Map {
  id: number;
  name: string;
  uid: string;
  author: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface MapPlayHistory {
  id: number;
  player_id: number;
  map_id: number;
  played_at: Date;
  created_at: Date;
}

export interface Scrim {
  id: number;
  scrim_uid: string;
  league: League;
  status: ScrimStatus;
  match_type: MatchType;
  winner_team: number | null;
  elo_processed: boolean;
  created_at: Date;
  checkin_deadline: Date | null;
  completed_at: Date | null;
}

export interface ScrimPlayer {
  id: number;
  scrim_id: number;
  player_id: number;
  checked_in: boolean;
  checkin_at: Date | null;
}

export interface ScrimMap {
  id: number;
  scrim_id: number;
  map_id: number;
  map_order: number;
}

export interface ScrimResult {
  id: number;
  scrim_id: number;
  player_id: number;
  final_position: number;
  total_time: number | null;
  replay_file_url: string | null;
  submitted_at: Date;
}

// Elo & Stats Types

export interface EloRating {
  id: number;
  player_id: number;
  league: League;
  rating: number;
  wins: number;
  losses: number;
  updated_at: Date;
}

export interface EloHistory {
  id: number;
  player_id: number;
  scrim_id: number;
  old_rating: number;
  new_rating: number;
  change_amount: number;
  created_at: Date;
}

export interface MatchPlayerStats {
  id: number;
  scrim_id: number;
  map_id: number | null;
  player_id: number;
  team_id: number;
  points: number;
  is_finished: boolean;
  is_dnf: boolean;
  round_points: number[];
  nb_respawns: number;
  respawn_times: number[];
  best_time: number | null;
  cp_times: number[];
  respawn_time_loss: number[];
  nb_respawns_by_cp: number[];
  created_at: Date;
}

// Queue-related types
export interface QueueEntry {
  playerId: number;
  discordId: string;
  username: string;
  joinedAt: Date;
}

export interface QueueState {
  [league: string]: QueueEntry[];
}

// Map selection types
export interface MapWithPlayCount {
  map: Map;
  playCount: number;
}

// Web App URL generation types
export interface WebAppUrlData {
  scrimId: string;
  players: string[];
  maps: string[];
  timestamp: string;
}
