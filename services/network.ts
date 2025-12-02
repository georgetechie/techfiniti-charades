
import { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, NetworkMessage, Player, GamePhase, PlayerActionType } from '../types';
import { TEAM_COLORS, INITIAL_ROUND_TIME } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import { Peer, DataConnection } from 'peerjs';

// Prefix to ensure our peer IDs don't collide with other apps on the public server
const APP_PREFIX = 'charades-genai-party-2025';
const getPeerId = (code: string) => `${APP_PREFIX}-${code}`;

// Initial state factory
export const createInitialState = (roomCode: string, mode: 'ONLINE' | 'LOCAL' = 'ONLINE'): GameState => ({
  roomCode,
  mode,
  phase: GamePhase.LOBBY,
  players: [],
  teams: [
    { id: uuidv4(), name: `Team ${TEAM_COLORS[0].name}`, color: TEAM_COLORS[0].hex, score: 0, playerIds: [], nextPlayerIndex: 0 },
    { id: uuidv4(), name: `Team ${TEAM_COLORS[1].name}`, color: TEAM_COLORS[1].hex, score: 0, playerIds: [], nextPlayerIndex: 0 },
  ],
  clues: [],
  currentTurn: null,
  settings: {
    isLocked: false,
    roundTime: INITIAL_ROUND_TIME,
    roundsToWin: 5,
    allowPlayerControl: true, // Default true
    guessingMessage: "GUESS NOW!",
    opposingTeamMessage: "Opposing Team Guessing",
  }
});

// Helper to merge saved state with defaults to handle schema updates/migrations
const hydrateState = (saved: any, initial: GameState): GameState => {
    if (!saved) return initial;
    
    // Deep merge settings to ensure new flags (like allowPlayerControl) exist
    const mergedSettings = { 
        ...initial.settings, 
        ...(saved.settings || {}) 
    };
    
    // Ensure allowPlayerControl is explicitly true if it was undefined (legacy saves)
    if (saved.settings && saved.settings.allowPlayerControl === undefined) {
        mergedSettings.allowPlayerControl = true;
    }

    // Ensure new fields in Teams if any (e.g. nextPlayerIndex)
    const mergedTeams = (saved.teams || []).map((t: any) => ({
        ...t,
        nextPlayerIndex: t.nextPlayerIndex ?? 0
    }));

    return {
        ...saved,
        teams: mergedTeams,
        settings: mergedSettings
    };
};

// Shared Logic for advancing turn
export const calculateNextTurn = (prev: GameState, success: boolean): GameState => {
    if (!prev.currentTurn) return prev;

    // 1. Scoring: Only award points to the CURRENT team if SUCCESS is true.
    const newTeams = prev.teams.map(t => 
         (success && t.id === prev.currentTurn!.teamId) 
         ? { ...t, score: t.score + 1 } 
         : t
    );

    // 2. Mark clue as used
    const newClues = prev.clues.map(c => 
         c.id === prev.currentTurn!.clue?.id 
         ? { ...c, status: 'used' as const } 
         : c
    );

    // 3. Rotate to Next Team/Player
    const currentTeamIdx = prev.teams.findIndex(t => t.id === prev.currentTurn!.teamId);
    if (currentTeamIdx === -1) return prev;

    const nextTeamIdx = (currentTeamIdx + 1) % prev.teams.length;
    const nextTeam = prev.teams[nextTeamIdx];

    // Get next player for the NEW team
    let playerIndex = nextTeam.nextPlayerIndex || 0;
    if (playerIndex >= nextTeam.playerIds.length) {
        playerIndex = 0; 
    }
    const actorId = nextTeam.playerIds[playerIndex];

    // Update index for next time this team plays
    const newNextIndex = (playerIndex + 1) % (nextTeam.playerIds.length || 1);
    
    const updatedTeams = newTeams.map((t, idx) => 
        idx === nextTeamIdx ? { ...t, nextPlayerIndex: newNextIndex } : t
    );

    return {
        ...prev,
        teams: updatedTeams,
        clues: newClues,
        currentTurn: {
            teamId: nextTeam.id,
            actorId: actorId,
            clue: null,
            timeLeft: prev.settings.roundTime,
            isActive: false,
            roundNumber: prev.currentTurn.roundNumber + 1
        }
    };
};

// Hook for the HOST
export const useHostGame = (roomCode: string) => {
  const [gameState, setGameState] = useState<GameState>(() => {
    const savedStr = localStorage.getItem(`host_state_${roomCode}`);
    const saved = savedStr ? JSON.parse(savedStr) : null;
    const initial = createInitialState(roomCode, 'ONLINE');
    return hydrateState(saved, initial);
  });
  
  const gameStateRef = useRef(gameState);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]);

  // Keep ref sync
  useEffect(() => {
    gameStateRef.current = gameState;
    localStorage.setItem(`host_state_${roomCode}`, JSON.stringify(gameState));
  }, [gameState, roomCode]);

  // Broadcast state changes
  useEffect(() => {
    const json = JSON.stringify({ type: 'STATE_UPDATE', payload: gameState });
    connectionsRef.current.forEach(conn => {
        if (conn.open) {
            conn.send(JSON.parse(json));
        }
    });
  }, [gameState]);

  // Setup Host Peer
  useEffect(() => {
    const peerId = getPeerId(roomCode);
    console.log('Initializing Host Peer:', peerId);
    
    const peer = new Peer(peerId, { debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Host Online:', id);
    });

    peer.on('connection', (conn) => {
      console.log('New Player Connection:', conn.peer);
      
      conn.on('open', () => {
         connectionsRef.current.push(conn);
      });

      conn.on('data', (data) => {
        const msg = data as NetworkMessage;
        
        if (msg.type === 'PLAYER_JOIN') {
            setGameState(prev => {
                const existingPlayer = prev.players.find(p => p.id === msg.payload.id);
                
                // Locked game check
                if (prev.settings.isLocked && !existingPlayer) {
                    conn.send({ type: 'JOIN_ERROR', payload: { message: "Game is Locked" } });
                    setTimeout(() => conn.close(), 500);
                    return prev;
                }

                if (existingPlayer) {
                    // Update player details (reconnect)
                    const updatedPlayer = { 
                        ...msg.payload, 
                        teamId: existingPlayer.teamId,
                        isHost: existingPlayer.isHost 
                    };
                    const updatedPlayers = prev.players.map(p => 
                        p.id === msg.payload.id ? updatedPlayer : p
                    );
                    const newState = { ...prev, players: updatedPlayers };
                    conn.send({ type: 'STATE_UPDATE', payload: newState });
                    return newState;
                }
                
                // Add new player
                const teamCounts = prev.teams.map(t => ({ id: t.id, count: t.playerIds.length }));
                teamCounts.sort((a, b) => a.count - b.count);
                const targetTeamId = teamCounts[0].id;
                
                const newPlayer = { ...msg.payload, teamId: targetTeamId };
                const newTeams = prev.teams.map(t => 
                    t.id === targetTeamId ? { ...t, playerIds: [...t.playerIds, newPlayer.id] } : t
                );
                
                const newState = {
                    ...prev,
                    players: [...prev.players, newPlayer],
                    teams: newTeams
                };
                conn.send({ type: 'STATE_UPDATE', payload: newState });
                return newState;
            });
        }

        if (msg.type === 'REQUEST_STATE') {
             conn.send({ type: 'STATE_UPDATE', payload: gameStateRef.current });
        }

        if (msg.type === 'PLAYER_ACTION') {
            const { action, playerId, data: actionData } = msg.payload;
            
            setGameState(prev => {
                // Security: Ensure current turn actor matches requesting player
                if (!prev.currentTurn || prev.currentTurn.actorId !== playerId) {
                    return prev; 
                }

                if (action === 'REVEAL_CLUE') {
                    if (prev.currentTurn.clue) return prev;
                    const pending = prev.clues.filter(c => c.status === 'pending');
                    if (pending.length === 0) {
                        return { ...prev, phase: GamePhase.FINISHED };
                    }
                    const nextClue = pending[Math.floor(Math.random() * pending.length)];
                    return {
                        ...prev,
                        currentTurn: { ...prev.currentTurn, clue: nextClue }
                    };
                }

                if (action === 'START_TIMER') {
                    if (prev.currentTurn.isActive) return prev;
                    return {
                        ...prev,
                        currentTurn: { ...prev.currentTurn, isActive: true }
                    };
                }

                if (action === 'MARK_RESULT') {
                    if (prev.settings.allowPlayerControl) {
                        const success = actionData?.success === true;
                        return calculateNextTurn(prev, success);
                    }
                }

                return prev;
            });
        }
      });

      conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
      });
      
      conn.on('error', (err) => {
          console.error('Connection error:', err);
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
      });
    });

    peer.on('error', (err) => {
        console.error('Host Peer Error:', err);
    });

    return () => {
      peer.destroy();
    };
  }, [roomCode]);

  // Host Action to close game
  const closeGame = useCallback(() => {
      connectionsRef.current.forEach(conn => {
          if (conn.open) conn.send({ type: 'GAME_ENDED', payload: {} });
      });
      if (peerRef.current) {
          setTimeout(() => peerRef.current?.destroy(), 500);
      }
      localStorage.removeItem(`host_state_${roomCode}`);
  }, [roomCode]);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    setGameState(prev => updater(prev));
  }, []);

  return { gameState, updateState, closeGame };
};

// Hook for the PLAYER
export const usePlayerGame = (roomCode: string, currentPlayer: Player) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null); // Use ref to track state inside effects without dependency
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0); // Trigger to force re-setup

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // Sync ref
  useEffect(() => {
      gameStateRef.current = gameState;
  }, [gameState]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
      console.log('Manual reconnect triggered');
      setError(null);
      setRetryTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    // Cleanup old peer if exists
    if (peerRef.current) {
        peerRef.current.destroy();
    }

    const peer = new Peer(); 
    peerRef.current = peer;

    const connectToHost = () => {
        if (connRef.current?.open) return;

        console.log('Connecting to host...');
        const hostId = getPeerId(roomCode);
        const conn = peer.connect(hostId, { reliable: true });
        connRef.current = conn;

        conn.on('open', () => {
            console.log('Connected to Host');
            setError(null);
            setIsConnected(true);
            conn.send({ type: 'PLAYER_JOIN', payload: currentPlayer });
            conn.send({ type: 'REQUEST_STATE', payload: { playerId: currentPlayer.id } });
        });

        conn.on('data', (data) => {
            const msg = data as NetworkMessage;
            if (msg.type === 'STATE_UPDATE') {
                setGameState(msg.payload);
                setError(null);
                setIsConnected(true);
            }
            if (msg.type === 'JOIN_ERROR') {
                setError(msg.payload.message);
                conn.close();
            }
            if (msg.type === 'GAME_ENDED') {
                setGameState(prev => prev ? { ...prev, phase: GamePhase.FINISHED } : null);
                setError("Host ended the game.");
                conn.close();
            }
        });

        conn.on('close', () => {
            console.warn('Connection closed');
            connRef.current = null;
            setIsConnected(false);
        });

        conn.on('error', (err) => {
            console.error('Connection error', err);
            connRef.current = null;
            setIsConnected(false);
        });
    };

    peer.on('open', () => {
        connectToHost();
    });

    peer.on('error', (err) => {
        console.error('Player Peer Error', err);
        // Don't set error immediately for disconnects, only fatal
        if (err.type === 'peer-unavailable') {
             setError("Host not found. Check room code.");
        } else if (err.type === 'unavailable-id') {
             // Retry?
        } else {
             // setError("Connection Error. Try reconnecting.");
             // Just mark disconnected, let heartbeat retry
             setIsConnected(false);
        }
    });

    // Auto-reconnect logic handles both visibility (tab switching) and focus (window activation)
    const handleReconnection = () => {
        if (document.visibilityState === 'visible') {
            console.log('App gained focus/visibility. Checking connection...');
             // Clear transient errors/warnings to allow UI to show connecting state
            if (error && error.includes("Connection lost")) setError(null);

            if (peer.disconnected && !peer.destroyed) {
                console.log('Peer disconnected, attempting reconnect...');
                peer.reconnect();
            }
            if (!connRef.current || !connRef.current.open) {
                console.log('Connection closed, attempting connectToHost...');
                connectToHost();
            }
        }
    };
    
    document.addEventListener('visibilitychange', handleReconnection);
    window.addEventListener('focus', handleReconnection);

    const interval = setInterval(() => {
        if (peer.destroyed) return;
        
        // Fatal errors stop retries
        if (error && (error.includes("Locked") || error.includes("ended"))) return;

        if (!connRef.current || !connRef.current.open) {
            if (peer.open) connectToHost();
        } else {
             // Heartbeat: Use ref to avoid dependency cycle
             if (!gameStateRef.current) {
                connRef.current.send({ type: 'REQUEST_STATE', payload: { playerId: currentPlayer.id } });
             }
        }
    }, 3000);

    return () => {
        document.removeEventListener('visibilitychange', handleReconnection);
        window.removeEventListener('focus', handleReconnection);
        clearInterval(interval);
        peer.destroy();
    };
  }, [roomCode, currentPlayer.id, retryTrigger]); // Depend on retryTrigger to force restart

  const sendAction = useCallback((action: PlayerActionType, data?: any) => {
      if (connRef.current?.open) {
          connRef.current.send({
              type: 'PLAYER_ACTION',
              payload: { action, playerId: currentPlayer.id, data }
          });
      } else {
          console.warn("Action failed: Connection not open");
      }
  }, [currentPlayer.id]);

  return { gameState, sendAction, error, isConnected, reconnect };
};
