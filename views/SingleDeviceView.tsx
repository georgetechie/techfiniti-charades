
import React, { useState, useEffect } from 'react';
import { GameState, GamePhase, Clue, Player } from '../types';
import { createInitialState, calculateNextTurn } from '../services/network';
import { generateClues } from '../services/geminiService';
import { Button } from '../components/Button';
import { ClueCard } from '../components/ClueCard';
import { Avatar } from '../components/Avatar';
import { CATEGORIES, TEAM_COLORS, AVATAR_STYLES } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface SingleDeviceViewProps {
  onExit: () => void;
}

export const SingleDeviceView: React.FC<SingleDeviceViewProps> = ({ onExit }) => {
  // Local state management without PeerJS
  const [gameState, setGameState] = useState<GameState>(createInitialState('LOCAL', 'LOCAL'));
  const [clueCount, setClueCount] = useState(20);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Logic helpers
  const updateState = (updater: (prev: GameState) => GameState) => {
    setGameState(prev => updater(prev));
  };

  // Initialize dummy players for existing teams if empty (Local Mode setup)
  // This ensures the game engine has an "actor" for each team even though we don't name them.
  useEffect(() => {
      if (gameState.players.length === 0) {
          updateState(prev => {
              const newPlayers: Player[] = [];
              const newTeams = prev.teams.map(t => {
                  const dummyPlayer: Player = {
                      id: uuidv4(),
                      name: t.name, // Player name is just the Team name
                      avatarSeed: uuidv4(),
                      avatarStyle: AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)],
                      isHost: false,
                      teamId: t.id
                  };
                  newPlayers.push(dummyPlayer);
                  return { ...t, playerIds: [dummyPlayer.id] };
              });
              return { ...prev, players: newPlayers, teams: newTeams };
          });
      }
  }, []);

  // Timer Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (gameState.phase === GamePhase.PLAYING && gameState.currentTurn?.isActive) {
      interval = setInterval(() => {
        updateState(prev => {
          if (!prev.currentTurn || !prev.currentTurn.isActive) return prev;
          
          const newTime = prev.currentTurn.timeLeft - 1;
          
          if (newTime <= 0) {
             // Time expired
             return calculateNextTurn(prev, false);
          }

          return {
            ...prev,
            currentTurn: { ...prev.currentTurn, timeLeft: newTime }
          };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.currentTurn?.isActive]);

  // --- ACTIONS ---

  const addTeam = () => {
    if (gameState.teams.length >= TEAM_COLORS.length) return;
    
    // Find next available color
    const nextColorIdx = gameState.teams.length;
    const colorData = TEAM_COLORS[nextColorIdx];
    const newTeamId = uuidv4();

    // Create a dummy player for this team so turn logic works
    const dummyPlayer: Player = {
        id: uuidv4(),
        name: `Team ${colorData.name}`,
        avatarSeed: uuidv4(),
        avatarStyle: AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)],
        isHost: false,
        teamId: newTeamId
    };
    
    const newTeam = {
        id: newTeamId,
        name: `Team ${colorData.name}`,
        color: colorData.hex,
        score: 0,
        playerIds: [dummyPlayer.id],
        nextPlayerIndex: 0
    };

    updateState(prev => ({
        ...prev,
        players: [...prev.players, dummyPlayer],
        teams: [...prev.teams, newTeam]
    }));
  };

  const removeTeam = (teamId: string) => {
    if (gameState.teams.length <= 2) return; // Minimum 2 teams
    
    updateState(prev => {
        const teamToRemove = prev.teams.find(t => t.id === teamId);
        const playerIdsToRemove = teamToRemove ? teamToRemove.playerIds : [];
        
        const keptTeams = prev.teams.filter(t => t.id !== teamId);
        const keptPlayers = prev.players.filter(p => !playerIdsToRemove.includes(p.id));

        return {
            ...prev,
            teams: keptTeams,
            players: keptPlayers
        };
    });
  };
  
  const updateTeamName = (teamId: string, newName: string) => {
    updateState(prev => ({
        ...prev,
        teams: prev.teams.map(t => t.id === teamId ? { ...t, name: newName } : t)
    }));
  };

  const startGame = async () => {
    // Check total teams
    if (gameState.teams.length < 2) return alert("Need at least 2 teams!");

    setIsGenerating(true);
    const newClues = await generateClues(selectedCategory, clueCount, difficulty, []);
    
    updateState(prev => {
         // Setup first turn logic
         const firstTeam = prev.teams[0];
         // Ensure we have a valid actor (dummy player)
         const firstPlayerId = firstTeam.playerIds[0];
         
         const updatedTeams = prev.teams.map((t, idx) => 
            idx === 0 ? { ...t, nextPlayerIndex: 1 } : t
         );

         return {
            ...prev,
            phase: GamePhase.PLAYING,
            clues: newClues,
            teams: updatedTeams,
            currentTurn: {
                teamId: firstTeam.id,
                actorId: firstPlayerId,
                clue: null,
                timeLeft: prev.settings.roundTime,
                isActive: false,
                roundNumber: 1
            }
         };
    });
    setIsGenerating(false);
  };

  // Game Flow
  const pickClue = () => {
      const pending = gameState.clues.filter(c => c.status === 'pending');
      if (pending.length === 0) {
          updateState(prev => ({ ...prev, phase: GamePhase.FINISHED }));
          return;
      }
      const nextClue = pending[Math.floor(Math.random() * pending.length)];
      updateState(prev => ({
          ...prev,
          currentTurn: prev.currentTurn ? { ...prev.currentTurn, clue: nextClue } : null
      }));
  };

  const startTimer = () => {
      updateState(prev => ({
          ...prev,
          currentTurn: prev.currentTurn ? { ...prev.currentTurn, isActive: true } : null
      }));
  };

  const markResult = (success: boolean) => {
      updateState(prev => calculateNextTurn(prev, success));
  };


  // --- RENDERERS ---

  if (gameState.phase === GamePhase.LOBBY) {
      // Re-purposing Lobby as Setup Screen for Single Device
      return (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in">
              <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold">Game Setup</h2>
                  <p className="text-white/50">Pass & Play Mode</p>
              </div>

              {/* Game Settings */}
              <div className="bg-dark-800 p-6 rounded-2xl space-y-4 border border-white/5">
                  <h3 className="text-xs uppercase font-bold text-white/40">Settings</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="col-span-2">
                          <label className="text-xs text-white/50 block mb-1">Category</label>
                          <select className="w-full bg-dark-900 p-2 rounded-lg border border-white/10" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-white/50 block mb-1">Questions</label>
                          <input type="number" className="w-full bg-dark-900 p-2 rounded-lg border border-white/10" value={clueCount} onChange={e => setClueCount(Number(e.target.value))} />
                      </div>
                      <div>
                          <label className="text-xs text-white/50 block mb-1">Time (s)</label>
                          <input type="number" className="w-full bg-dark-900 p-2 rounded-lg border border-white/10" value={gameState.settings.roundTime} onChange={e => updateState(p => ({...p, settings: {...p.settings, roundTime: Number(e.target.value)}}))} step={5} />
                      </div>
                  </div>
              </div>

              {/* Roster */}
              <div className="bg-dark-800 p-6 rounded-2xl space-y-6 border border-white/5">
                  <div className="flex justify-between items-center">
                      <h3 className="text-xs uppercase font-bold text-white/40">Teams ({gameState.teams.length})</h3>
                      <Button variant="secondary" onClick={addTeam} disabled={gameState.teams.length >= TEAM_COLORS.length} className="text-xs py-2 h-auto">
                          + Add Team
                      </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {gameState.teams.map(team => (
                          <div key={team.id} className="bg-white/5 rounded-xl p-4 border border-white/5 flex justify-between items-center" style={{ borderColor: team.color.replace('bg-', '').replace('500', '400') }}>
                              <input 
                                type="text"
                                value={team.name}
                                onChange={(e) => updateTeamName(team.id, e.target.value)}
                                className={`font-bold bg-transparent border-b border-white/20 focus:border-white focus:outline-none w-full ${team.color.replace('bg-', 'text-')}`}
                                placeholder="Team Name"
                              />
                              {gameState.teams.length > 2 && (
                                  <button 
                                    onClick={() => removeTeam(team.id)} 
                                    className="text-red-400 hover:text-red-300 p-2 hover:bg-white/5 rounded transition-colors"
                                    title="Remove Team"
                                  >✕</button>
                              )}
                          </div>
                      ))}
                  </div>
                  <div className="text-center text-xs text-white/30 italic">
                      In this mode, pass the device to any player on the current team.
                  </div>
              </div>

              <div className="flex gap-4">
                  <Button variant="ghost" onClick={onExit} className="flex-1">Exit</Button>
                  <Button onClick={startGame} disabled={gameState.teams.length < 2 || isGenerating} className="flex-[2]">
                      {isGenerating ? 'Generating Clues...' : 'Start Game'}
                  </Button>
              </div>
          </div>
      );
  }

  if (gameState.phase === GamePhase.PLAYING && gameState.currentTurn) {
      const turn = gameState.currentTurn;
      const team = gameState.teams.find(t => t.id === turn.teamId);
      // For local play, the actor name is likely just the team name, so we can ignore it if we want, or display it.
      
      // Interstitial "Pass Device" Screen
      if (!turn.clue) {
          return (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in zoom-in duration-300">
                  <div className="text-center space-y-2">
                      <h2 className="text-4xl font-bold">Pass the Device</h2>
                      <p className="text-white/50">It is {team?.name}'s turn</p>
                  </div>

                  <div className="bg-dark-800 p-8 rounded-3xl border border-white/10 flex flex-col items-center gap-4 w-full max-w-sm">
                      <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl font-black ${team?.color.replace('bg-', 'bg-') || 'bg-gray-500'} text-white shadow-xl`}>
                         {team?.name.charAt(team.name.length - 1)}
                      </div>
                      <div className="text-center">
                          <h3 className={`text-3xl font-bold ${team?.color.replace('bg-', 'text-')}`}>{team?.name}</h3>
                          <p className="text-white/50">Get ready to act!</p>
                      </div>
                  </div>

                  <Button onClick={pickClue} className="text-xl py-4 px-12 animate-pulse-fast">
                      I'm Ready!
                  </Button>

                  {/* Scoreboard Preview */}
                  <div className="flex gap-4 opacity-50">
                      {gameState.teams.map(t => (
                          <div key={t.id} className="text-center">
                              <div className={`text-xs font-bold ${t.color.replace('bg-', 'text-')}`}>{t.name}</div>
                              <div className="font-mono text-xl">{t.score}</div>
                          </div>
                      ))}
                  </div>
              </div>
          );
      }

      // Active Clue Screen
      return (
          <div className="flex flex-col items-center justify-center min-h-[70vh] w-full max-w-md mx-auto space-y-6">
              {/* Header Info */}
              <div className="flex justify-between w-full px-4 text-sm font-bold text-white/40 uppercase">
                  <div className={`${team?.color.replace('bg-', 'text-')}`}>{team?.name}</div>
                  <div>Round {turn.roundNumber}</div>
              </div>

              {/* Clue Card */}
              <ClueCard text={turn.clue.text} category={selectedCategory} />

              {/* Timer & Controls */}
              <div className="w-full text-center space-y-6">
                  <div className={`text-6xl font-mono font-black transition-colors ${turn.timeLeft < 10 ? 'text-red-500' : 'text-white'}`}>
                      {turn.timeLeft}
                  </div>

                  {!turn.isActive && turn.timeLeft > 0 && (
                      <Button onClick={startTimer} className="w-full text-xl py-4 animate-bounce-small">
                          Start Timer
                      </Button>
                  )}

                  {turn.isActive && (
                      <div className="flex gap-4">
                          <Button variant="danger" fullWidth className="py-6 text-lg" onClick={() => markResult(false)}>
                              Skip
                          </Button>
                          <Button variant="primary" fullWidth className="py-6 text-lg" onClick={() => markResult(true)}>
                              Got It!
                          </Button>
                      </div>
                  )}

                  {turn.timeLeft === 0 && (
                      <div className="text-white/50">Time's Up!</div>
                  )}
              </div>
              
              <Button variant="ghost" onClick={onExit} className="mt-8 text-white/20 hover:text-white">
                  Exit Game
              </Button>
          </div>
      );
  }

  if (gameState.phase === GamePhase.FINISHED) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-in zoom-in">
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">
                Game Over!
            </h1>
            
            <div className="grid grid-cols-2 gap-8">
               {gameState.teams.map(t => (
                   <div key={t.id} className="bg-dark-800 p-6 rounded-2xl border border-white/10">
                       <h2 className={`text-2xl font-bold mb-2 ${t.color.replace('bg-', 'text-')}`}>{t.name}</h2>
                       <p className="text-7xl font-black text-white">{t.score}</p>
                   </div>
               ))}
            </div>

            <Button className="mt-12 py-4 px-8" onClick={onExit}>Back to Menu</Button>
        </div>
      );
  }

  return null;
};
