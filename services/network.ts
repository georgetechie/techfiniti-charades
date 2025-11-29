
import { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, NetworkMessage, Player, GamePhase, PlayerActionType } from '../types';
import { TEAM_COLORS, INITIAL_ROUND_TIME } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import { Peer, DataConnection } from 'peerjs';

// Prefix to ensure our peer IDs don't collide with other apps on the public server
const APP_PREFIX = 'charades-genai-party-2025';
const getPeerId = (code: string) => `${APP_PREFIX}-${code}`;

// Initial state factory
export const createInitialState = (roomCode: string): GameState => ({
  roomCode,
  phase: GamePhase.LOBBY,
  players: [],
  teams: [
    { id: uuidv4(), name: `Team ${TEAM_COLORS[0].name}`, color: TEAM_COLORS[0].hex, score: 0, playerIds: [], nextPlayerIndex: 0 },
    { id: uuidv4(), name: `Team ${TEAM_COLORS[1].name}`, color: TEAM_COLORS[1].hex, score: 0, playerIds: [], nextPlayerIndex: 0 },
  ],
  clues: [],
  currentTurn: null,
  settings: {
    roundTime: INITIAL_ROUND_TIME,
    roundsToWin: 5,
    allowPlayerControl: false,
    guessingMessage: "GUESS NOW!",
    opposingTeamMessage: "Opposing Team Guessing",
  }
});

// Shared Logic for advancing turn (Moved from HostView to ensure consistency with Player Actions)
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
    // Find Current Team Index
    const currentTeamIdx = prev.teams.findIndex(t => t.id === prev.currentTurn!.teamId);
    // Fallback if team not found (shouldn't happen)
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
            clue: null, // Reset clue so we go to "Next Up" screen
            timeLeft: prev.settings.roundTime,
            isActive: false,
            roundNumber: prev.currentTurn.roundNumber + 1
        }
    };
};

// Hook for the HOST
export const useHostGame = (roomCode: string) => {
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem(`host_state_${roomCode}`);
    return saved ? JSON.parse(saved) : createInitialState(roomCode);
  });
  
  const gameStateRef = useRef(gameState);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]);

  // Keep ref sync
  useEffect(() => {
    gameStateRef.current = gameState;
    localStorage.setItem(`host_state_${roomCode}`, JSON.stringify(gameState));
  }, [gameState, roomCode]);

  // Broadcast state changes to all connected peers
  useEffect(() => {
    const json = JSON.stringify({ type: 'STATE_UPDATE', payload: gameState });
    connectionsRef.current.forEach(conn => {
        if (conn.open) {
            conn.send(JSON.parse(json)); // PeerJS handles serialization, but ensuring clean obj helps
        }
    });
  }, [gameState]);

  // Setup Host Peer
  useEffect(() => {
    const peerId = getPeerId(roomCode);
    console.log('Initializing Host Peer:', peerId);
    
    const peer = new Peer(peerId, {
        debug: 1,
    });
    
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Host Online:', id);
    });

    peer.on('connection', (conn) => {
      console.log('New Player Connection:', conn.peer);
      
      conn.on('open', () => {
         connectionsRef.current.push(conn);
         // Send immediate state sync
         conn.send({ type: 'STATE_UPDATE', payload: gameStateRef.current });
      });

      conn.on('data', (data) => {
        const msg = data as NetworkMessage;
        
        if (msg.type === 'PLAYER_JOIN') {
            setGameState(prev => {
                const existingPlayer = prev.players.find(p => p.id === msg.payload.id);
                
                if (existingPlayer) {
                    // Player reconnecting: Update details (e.g. name change) but keep game state (teamId)
                    const updatedPlayer = { 
                        ...msg.payload, 
                        teamId: existingPlayer.teamId,
                        isHost: existingPlayer.isHost 
                    };
                    
                    const updatedPlayers = prev.players.map(p => 
                        p.id === msg.payload.id ? updatedPlayer : p
                    );
                    
                    const newState = { ...prev, players: updatedPlayers };

                    // IMPORTANT: Send the state explicitly to the reconnecting player immediately
                    conn.send({ type: 'STATE_UPDATE', payload: newState });
                    return newState;
                }
                
                // Auto assign team logic (New Player)
                const teamCounts = prev.teams.map(t => ({ id: t.id, count: t.playerIds.length }));
                teamCounts.sort((a, b) => a.count - b.count);
                const targetTeamId = teamCounts[0].id;
                
                const newPlayer = { ...msg.payload, teamId: targetTeamId };
                const newTeams = prev.teams.map(t => 
                    t.id === targetTeamId ? { ...t, playerIds: [...t.playerIds, newPlayer.id] } : t
                );

                return {
                    ...prev,
                    players: [...prev.players, newPlayer],
                    teams: newTeams
                };
            });
        }

        if (msg.type === 'REQUEST_STATE') {
             conn.send({ type: 'STATE_UPDATE', payload: gameStateRef.current });
        }

        if (msg.type === 'PLAYER_ACTION') {
            const { action, playerId, data: actionData } = msg.payload;
            
            setGameState(prev => {
                // Security/Validation: Ensure current turn actor matches requesting player
                if (!prev.currentTurn || prev.currentTurn.actorId !== playerId) {
                    return prev; 
                }

                if (action === 'REVEAL_CLUE') {
                    if (prev.currentTurn.clue) return prev; // Already revealed

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
                    // Check if player control is enabled or if the user is somehow authorized
                    // (The logic is generally strict, but we check the setting)
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
        // If ID is taken (e.g. refresh), we might want to alert, 
        // but often the old peer just needs to time out.
    });

    return () => {
      peer.destroy();
    };
  }, [roomCode]);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    setGameState(prev => updater(prev));
  }, []);

  return { gameState, updateState };
};

// Hook for the PLAYER
export const usePlayerGame = (roomCode: string, currentPlayer: Player) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  useEffect(() => {
    // Player uses a random ID for the peer connection itself, 
    // but identifying data is in the payload
    const peer = new Peer(); 
    peerRef.current = peer;

    const connectToHost = () => {
        if (connRef.current?.open) return;

        const hostId = getPeerId(roomCode);
        console.log('Connecting to host:', hostId);
        
        const conn = peer.connect(hostId, { reliable: true });
        connRef.current = conn;

        conn.on('open', () => {
            console.log('Connected to Host');
            conn.send({ type: 'PLAYER_JOIN', payload: currentPlayer });
            conn.send({ type: 'REQUEST_STATE', payload: { playerId: currentPlayer.id } });
        });

        conn.on('data', (data) => {
            const msg = data as NetworkMessage;
            if (msg.type === 'STATE_UPDATE') {
                setGameState(msg.payload);
            }
        });

        conn.on('close', () => {
            console.log('Disconnected from host');
            connRef.current = null;
        });

        conn.on('error', (err) => {
            console.error('Connection error', err);
        });
    };

    peer.on('open', () => {
        connectToHost();
    });

    peer.on('error', (err) => {
        console.error('Player Peer Error', err);
    });

    // Reconnection loop if disconnected
    const interval = setInterval(() => {
        if (peer.destroyed) return;
        if (!connRef.current || !connRef.current.open) {
            if (peer.open) {
                 connectToHost();
            }
        } else {
            // Heartbeat / Ensure state
            if (!gameState) {
                connRef.current.send({ type: 'REQUEST_STATE', payload: { playerId: currentPlayer.id } });
            }
        }
    }, 3000);

    return () => {
        clearInterval(interval);
        peer.destroy();
    };
  }, [roomCode, currentPlayer.id]); // Dependencies must allow reconnect if player structure is stable

  const sendAction = useCallback((action: PlayerActionType, data?: any) => {
      if (connRef.current?.open) {
          connRef.current.send({
              type: 'PLAYER_ACTION',
              payload: { action, playerId: currentPlayer.id, data }
          });
      }
  }, [currentPlayer.id]);

  return { gameState, sendAction };
};
