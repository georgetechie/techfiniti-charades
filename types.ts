
export enum GamePhase {
  LANDING = 'LANDING',
  LOBBY = 'LOBBY',
  SETUP = 'SETUP',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
}

export interface Player {
  id: string;
  name: string;
  avatarSeed: string; // For generating consistent random avatars
  avatarStyle: string; // The visual style of the avatar (e.g., 'notionists', 'bottts')
  teamId?: string;
  isHost: boolean;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  score: number;
  playerIds: string[];
  nextPlayerIndex: number; // Tracks who plays next in this team
}

export interface Clue {
  id: string;
  text: string;
  status: 'pending' | 'used' | 'skipped';
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  teams: Team[];
  clues: Clue[];
  currentTurn: {
    teamId: string;
    actorId: string;
    clue: Clue | null;
    timeLeft: number;
    isActive: boolean; // Timer running
    roundNumber: number;
  } | null;
  settings: {
    roundTime: number; // Seconds
    roundsToWin: number;
    allowPlayerControl: boolean; // Allow actor to mark success/skip
    guessingMessage: string; // Message for teammates
    opposingTeamMessage: string; // Message for opponents
  };
}

export type PlayerActionType = 'REVEAL_CLUE' | 'START_TIMER' | 'MARK_RESULT';

export type NetworkMessage = 
  | { type: 'STATE_UPDATE'; payload: GameState }
  | { type: 'PLAYER_JOIN'; payload: Player }
  | { type: 'REQUEST_STATE'; payload: { playerId: string } }
  | { type: 'PLAYER_LEAVE'; payload: { playerId: string } }
  | { type: 'PLAYER_ACTION'; payload: { action: PlayerActionType; playerId: string; data?: any } }
  | { type: 'HOST_ACTION'; payload: any }; // Generic action passed to host
