
import React, { useState, useEffect, useRef } from 'react';
import { useHostGame, calculateNextTurn } from '../services/network';
import { Player, Clue, GamePhase } from '../types';
import { generateClues } from '../services/geminiService';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { CATEGORIES, TEAM_COLORS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface HostViewProps {
  roomCode: string;
  hostPlayer: Player;
}

export const HostView: React.FC<HostViewProps> = ({ roomCode, hostPlayer }) => {
  const { gameState, updateState } = useHostGame(roomCode);
  const [clueCount, setClueCount] = useState(20);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customClue, setCustomClue] = useState('');
  
  // Import State
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add host to player list initially if not there, BUT DO NOT ADD TO TEAM
  useEffect(() => {
    updateState(prev => {
        if (prev.players.find(p => p.id === hostPlayer.id)) return prev;
        
        // Host is explicitly a moderator, not a team member
        const hostModerator = { ...hostPlayer, isHost: true, teamId: undefined }; 
        
        return {
            ...prev,
            players: [...prev.players, hostModerator],
            // Do NOT update teams to include host
        }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
             // Time expired: Auto-advance with NO success
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
  }, [gameState.phase, gameState.currentTurn?.isActive, updateState]);

  // --- TEAM MANAGEMENT ---
  const addTeam = () => {
    if (gameState.teams.length >= TEAM_COLORS.length) return;
    
    const nextColorIdx = gameState.teams.length;
    const colorData = TEAM_COLORS[nextColorIdx];
    
    const newTeam = {
        id: uuidv4(),
        name: `Team ${colorData.name}`,
        color: colorData.hex,
        score: 0,
        playerIds: [],
        nextPlayerIndex: 0
    };

    updateState(prev => ({
        ...prev,
        teams: [...prev.teams, newTeam]
    }));
  };

  const removeTeam = () => {
    if (gameState.teams.length <= 2) return;
    
    updateState(prev => {
        if (prev.teams.length <= 2) return prev;
        
        const keptTeams = prev.teams.slice(0, -1).map(t => ({ ...t, playerIds: [...t.playerIds] }));
        const removedTeamId = prev.teams[prev.teams.length - 1].id;
        
        const playersToMove = prev.players.filter(p => p.teamId === removedTeamId);
        const playersKeeping = prev.players.filter(p => p.teamId !== removedTeamId);
        
        // Host remains without team
        const movedPlayers = playersToMove.map((p, i) => {
             const targetTeamIndex = i % keptTeams.length;
             const targetTeam = keptTeams[targetTeamIndex];
             // Add to target team's player list
             targetTeam.playerIds.push(p.id);
             // Return updated player
             return { ...p, teamId: targetTeam.id };
        });
        
        return {
            ...prev,
            teams: keptTeams,
            players: [...playersKeeping, ...movedPlayers]
        };
    });
  };

  const updateTeamName = (teamId: string, newName: string) => {
    updateState(prev => ({
        ...prev,
        teams: prev.teams.map(t => t.id === teamId ? { ...t, name: newName } : t)
    }));
  };

  const shuffleTeams = () => {
    updateState(prev => {
        // Only shuffle players who are currently in teams or are NOT the host
        // We filter players who are NOT host to distribute them.
        const playersToDistribute = prev.players.filter(p => !p.isHost).sort(() => Math.random() - 0.5);
        
        const emptyTeams = prev.teams.map(t => ({ ...t, playerIds: [], nextPlayerIndex: 0 }));
        
        const distributedPlayers = playersToDistribute.map((p, i) => {
            const teamIndex = i % emptyTeams.length;
            const team = emptyTeams[teamIndex];
            team.playerIds.push(p.id);
            return { ...p, teamId: team.id };
        });

        // Add host back to player list unchanged
        const hostPlayers = prev.players.filter(p => p.isHost);
        
        return {
            ...prev,
            players: [...hostPlayers, ...distributedPlayers],
            teams: emptyTeams
        };
    });
  };

  const movePlayer = (playerId: string) => {
     updateState(prev => {
         const playerIndex = prev.players.findIndex(p => p.id === playerId);
         if (playerIndex === -1) return prev;
         
         const player = { ...prev.players[playerIndex] };
         // If player has no team (unlikely for regular players but safe to check), find one
         let currentTeamIdx = prev.teams.findIndex(t => t.id === player.teamId);
         
         // Logic: if currentTeamIdx is -1 (no team), move to team 0. Else move to next.
         const nextTeamIdx = currentTeamIdx === -1 ? 0 : (currentTeamIdx + 1) % prev.teams.length;
         const nextTeamId = prev.teams[nextTeamIdx].id;
         
         const oldTeamId = player.teamId;
         player.teamId = nextTeamId;
         
         // Update players array
         const newPlayers = [...prev.players];
         newPlayers[playerIndex] = player;
         
         // Update teams playerIds
         const newTeams = prev.teams.map(t => {
             if (t.id === oldTeamId) {
                 return { ...t, playerIds: t.playerIds.filter(id => id !== playerId) };
             }
             if (t.id === nextTeamId) {
                 return { ...t, playerIds: [...t.playerIds, playerId] };
             }
             return t;
         });

         return {
             ...prev,
             players: newPlayers,
             teams: newTeams
         };
     });
  };

  const kickPlayer = (playerId: string) => {
      if (!confirm("Are you sure you want to remove this player from the game?")) return;

      updateState(prev => {
          // 1. Remove from global players list
          const newPlayers = prev.players.filter(p => p.id !== playerId);

          // 2. Remove from teams
          const newTeams = prev.teams.map(t => ({
              ...t,
              playerIds: t.playerIds.filter(id => id !== playerId)
          }));

          // 3. Handle active turn
          let newTurn = prev.currentTurn;
          if (prev.currentTurn && prev.currentTurn.actorId === playerId) {
              // If actor kicked, we just cancel the turn. Host can press "Force Next".
              newTurn = { ...prev.currentTurn, isActive: false, timeLeft: 0 }; 
          }

          return {
              ...prev,
              players: newPlayers,
              teams: newTeams,
              currentTurn: newTurn
          };
      });
  };

  const updateRoundTime = (seconds: number) => {
    updateState(prev => ({
        ...prev,
        settings: { ...prev.settings, roundTime: seconds }
    }));
  };

  const togglePlayerControl = () => {
    updateState(prev => ({
        ...prev,
        settings: { ...prev.settings, allowPlayerControl: !prev.settings.allowPlayerControl }
    }));
  };

  const toggleGameLock = () => {
      updateState(prev => ({
          ...prev,
          settings: { ...prev.settings, isLocked: !prev.settings.isLocked }
      }));
  };

  const updateMessageSetting = (key: 'guessingMessage' | 'opposingTeamMessage', value: string) => {
      updateState(prev => ({
          ...prev,
          settings: { ...prev.settings, [key]: value }
      }));
  };

  // --- GAME LOGIC ---

  const startGame = () => {
    // Check actual players (excluding host)
    const activePlayers = gameState.players.filter(p => !p.isHost);
    if (activePlayers.length < 2) {
       // Ideally verify enough players
       // return alert("Need at least 2 players!");
    }
    // Update state and Auto-Lock the game
    updateState(prev => ({ 
        ...prev, 
        phase: GamePhase.SETUP,
        settings: { ...prev.settings, isLocked: true }
    }));
  };

  const generateGameClues = async () => {
    setIsGenerating(true);
    // Get existing clues to avoid duplicates
    const existingTexts = gameState.clues.map(c => c.text);
    
    const newClues = await generateClues(selectedCategory, clueCount, difficulty, existingTexts);
    
    updateState(prev => ({ 
        ...prev, 
        clues: [...prev.clues, ...newClues]
    }));
    setIsGenerating(false);
  };

  const addCustomClue = () => {
      if(!customClue.trim()) return;
      const clue: Clue = { id: uuidv4(), text: customClue, status: 'pending' };
      updateState(prev => ({ ...prev, clues: [...prev.clues, clue] }));
      setCustomClue('');
  };

  // Import Logic
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          setImportText(text);
      };
      reader.readAsText(file);
      // Reset input so same file can be selected again if needed
      e.target.value = '';
  };

  const processImport = () => {
      const lines = importText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const newClues: Clue[] = lines.map(text => ({
          id: uuidv4(),
          text,
          status: 'pending'
      }));
      
      updateState(prev => ({ ...prev, clues: [...prev.clues, ...newClues] }));
      setImportText('');
      setShowImport(false);
  };

  const removeClue = (id: string) => {
    updateState(prev => ({ ...prev, clues: prev.clues.filter(c => c.id !== id) }));
  };

  const beginPlaying = () => {
    if (gameState.clues.length === 0) return alert("Add some clues first!");
    
    // START ROTATION: Always start with Team 0
    const firstTeamIndex = 0;
    const firstTeam = gameState.teams[firstTeamIndex];
    
    if (firstTeam.playerIds.length === 0) return alert("Teams need players!");
    
    // Get correct player index for this team
    let currentPlayerIndex = firstTeam.nextPlayerIndex || 0;
    if (currentPlayerIndex >= firstTeam.playerIds.length) {
        currentPlayerIndex = 0; 
    }

    const firstPlayerId = firstTeam.playerIds[currentPlayerIndex];

    // Increment index for next time this team plays
    const nextIndex = (currentPlayerIndex + 1) % firstTeam.playerIds.length;
    
    const updatedTeams = gameState.teams.map((t, idx) => 
        idx === firstTeamIndex ? { ...t, nextPlayerIndex: nextIndex } : t
    );

    updateState(prev => ({
        ...prev,
        phase: GamePhase.PLAYING,
        teams: updatedTeams,
        currentTurn: {
            teamId: firstTeam.id,
            actorId: firstPlayerId,
            clue: null,
            timeLeft: prev.settings.roundTime,
            isActive: false,
            roundNumber: 1
        }
    }));
  };

  // Manual next turn (e.g. forced)
  const nextTurn = () => {
      updateState(prev => calculateNextTurn(prev, false)); // Forced next usually implies no score
  };

  const endGame = () => {
      if (confirm("Are you sure you want to end the game now? Final scores will be displayed.")) {
          updateState(prev => ({ ...prev, phase: GamePhase.FINISHED }));
      }
  };

  const pickClue = () => {
    // Pick a random pending clue
    const pending = gameState.clues.filter(c => c.status === 'pending');
    if (pending.length === 0) {
        alert("No more clues! Game Over.");
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

  // Called when user clicks "Got it" or "Skip"
  const markResult = (success: boolean) => {
      updateState(prev => calculateNextTurn(prev, success));
  };

  // --- RENDERERS ---

  if (gameState.phase === GamePhase.LOBBY) {
    // Active players (excluding host)
    const activePlayers = gameState.players.filter(p => !p.isHost);

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
             <div className="bg-dark-800 px-6 py-4 rounded-3xl border border-white/5 text-center flex-1 w-full md:w-auto flex flex-col items-center">
                <h2 className="text-sm text-white/50 uppercase font-bold tracking-wider mb-1">Join Code</h2>
                <div className="text-5xl font-black text-brand-400 tracking-widest font-mono mb-2">{gameState.roomCode}</div>
                
                {/* Lock Toggle */}
                <div className="flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-1 rounded-full hover:bg-white/10 transition-colors" onClick={toggleGameLock}>
                    <div className={`w-2 h-2 rounded-full ${gameState.settings.isLocked ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                        {gameState.settings.isLocked ? 'LOCKED' : 'OPEN'}
                    </span>
                </div>
             </div>
             
             {/* Host Indicator */}
             <div className="flex items-center gap-3 bg-brand-900/30 border border-brand-500/20 px-4 py-3 rounded-2xl">
                <Avatar seed={hostPlayer.avatarSeed} style={hostPlayer.avatarStyle} size={40} />
                <div className="text-left">
                    <div className="text-xs font-bold text-brand-300 uppercase">Moderator</div>
                    <div className="font-bold">{hostPlayer.name} (You)</div>
                </div>
             </div>
        </div>

        {/* Team Controls */}
        <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="secondary" onClick={addTeam} disabled={gameState.teams.length >= TEAM_COLORS.length} className="text-sm py-2">
                + Add Team
            </Button>
            <Button variant="secondary" onClick={removeTeam} disabled={gameState.teams.length <= 2} className="text-sm py-2">
                - Remove Team
            </Button>
            <Button variant="secondary" onClick={shuffleTeams} className="text-sm py-2">
                🔀 Shuffle Players
            </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gameState.teams.map(team => (
                <div key={team.id} className={`p-4 rounded-2xl bg-white/5 border-2 relative transition-all`} style={{ borderColor: team.color.replace('bg-', '').replace('500', '400') }}>
                    <input 
                        type="text"
                        value={team.name}
                        onChange={(e) => updateTeamName(team.id, e.target.value)}
                        className={`font-bold mb-4 text-center bg-transparent border-b border-white/20 focus:border-white focus:outline-none w-full ${team.color.replace('bg-', 'text-')}`}
                        placeholder="Team Name"
                    />
                    <div className="space-y-2">
                        {gameState.players.filter(p => p.teamId === team.id).map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-dark-900/50 p-2 rounded-lg group">
                                <div className="flex items-center gap-2">
                                    <Avatar seed={p.avatarSeed} style={p.avatarStyle} size={32} />
                                    <span>{p.name}</span>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => movePlayer(p.id)}
                                        className="p-1 hover:bg-white/10 rounded text-xs text-white/50 hover:text-white"
                                        title="Move to next team"
                                    >
                                        ➡️
                                    </button>
                                    <button 
                                        onClick={() => kickPlayer(p.id)}
                                        className="p-1 hover:bg-red-500/20 rounded text-xs text-red-400 hover:text-red-300"
                                        title="Kick Player"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                         {gameState.players.filter(p => p.teamId === team.id).length === 0 && (
                            <div className="text-white/20 text-sm italic text-center py-2">Empty</div>
                         )}
                    </div>
                </div>
            ))}
        </div>

        {/* Unassigned Players (Should handle players who haven't been assigned yet, though logic usually assigns automatically) */}
        {gameState.players.filter(p => !p.isHost && !p.teamId).length > 0 && (
             <div className="bg-dark-800 p-4 rounded-2xl border border-dashed border-white/20">
                <h3 className="text-xs font-bold text-white/40 uppercase mb-2">Unassigned</h3>
                <div className="flex flex-wrap gap-2">
                    {gameState.players.filter(p => !p.isHost && !p.teamId).map(p => (
                         <div key={p.id} className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full cursor-pointer hover:bg-white/10 group">
                             <Avatar seed={p.avatarSeed} style={p.avatarStyle} size={20} />
                             <span className="text-sm">{p.name}</span>
                             <button 
                                onClick={(e) => { e.stopPropagation(); kickPlayer(p.id); }}
                                className="w-4 h-4 flex items-center justify-center rounded-full bg-white/10 hover:bg-red-500 text-[10px] text-white/50 hover:text-white ml-1"
                             >✕</button>
                         </div>
                    ))}
                </div>
             </div>
        )}

        <div className="flex justify-center pt-8">
            <Button onClick={startGame} className="w-full md:w-auto min-w-[200px]" disabled={activePlayers.length < 1}>
                Start Game Setup
            </Button>
        </div>
      </div>
    );
  }

  // Reuse logic for other phases
  if (gameState.phase === GamePhase.SETUP) {
    return (
        <div className="max-w-2xl mx-auto space-y-6">
             <div className="text-center">
                <h2 className="text-3xl font-bold">Game Setup</h2>
                <p className="text-white/50">Generate a bank of clues or add your own.</p>
             </div>

             <div className="bg-dark-800 p-6 rounded-2xl space-y-4">
                {/* Setup Controls */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs uppercase font-bold text-white/40">Category</label>
                        <select 
                            className="w-full bg-dark-900 p-3 rounded-lg mt-1 border border-white/10"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs uppercase font-bold text-white/40">Difficulty</label>
                        <select 
                            className="w-full bg-dark-900 p-3 rounded-lg mt-1 border border-white/10"
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value as any)}
                        >
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                        </select>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs uppercase font-bold text-white/40">Timer (Sec)</label>
                        <input 
                            type="number" 
                            className="w-full bg-dark-900 p-3 rounded-lg mt-1 border border-white/10"
                            value={gameState.settings.roundTime}
                            onChange={(e) => updateRoundTime(parseInt(e.target.value) || 30)}
                            min={10} 
                            max={300} 
                            step={5}
                        />
                    </div>
                </div>
                
                {/* Advanced Settings */}
                <div className="space-y-3 pt-2">
                    {/* Game Lock Toggle */}
                    <div className="flex items-center gap-3 bg-dark-900/50 p-3 rounded-lg border border-white/5 cursor-pointer" onClick={toggleGameLock}>
                        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${gameState.settings.isLocked ? 'bg-red-500' : 'bg-white/10'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${gameState.settings.isLocked ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <div>
                            <span className="text-sm font-bold block text-white/90">Lock Game</span>
                            <span className="text-xs text-white/50 block">Prevent new players from joining</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-dark-900/50 p-3 rounded-lg border border-white/5 cursor-pointer" onClick={togglePlayerControl}>
                        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${gameState.settings.allowPlayerControl ? 'bg-brand-500' : 'bg-white/10'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${gameState.settings.allowPlayerControl ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <span className="text-sm text-white/80 select-none">Allow Active Player to Mark "Got It" / "Skip"</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                         <div>
                            <label className="text-xs uppercase font-bold text-white/40">Teammate Message</label>
                            <input 
                                type="text" 
                                className="w-full bg-dark-900 p-2 rounded-lg mt-1 border border-white/10 text-sm"
                                value={gameState.settings.guessingMessage}
                                onChange={(e) => updateMessageSetting('guessingMessage', e.target.value)}
                                placeholder="GUESS NOW!"
                            />
                         </div>
                         <div>
                            <label className="text-xs uppercase font-bold text-white/40">Opponent Message</label>
                            <input 
                                type="text" 
                                className="w-full bg-dark-900 p-2 rounded-lg mt-1 border border-white/10 text-sm"
                                value={gameState.settings.opposingTeamMessage}
                                onChange={(e) => updateMessageSetting('opposingTeamMessage', e.target.value)}
                                placeholder="Opposing Team Guessing"
                            />
                         </div>
                    </div>
                </div>

                <div className="flex gap-2 items-end pt-2 border-t border-white/5 mt-4">
                    <div className="flex-1">
                         <label className="text-xs uppercase font-bold text-white/40">Amount</label>
                         <input type="number" value={clueCount} onChange={(e) => setClueCount(parseInt(e.target.value))} className="w-full bg-dark-900 p-3 rounded-lg mt-1 border border-white/10" min={1} max={100} />
                    </div>
                    <Button onClick={generateGameClues} disabled={isGenerating} className="flex-1 h-[50px]">
                        {isGenerating ? 'Generating...' : 'Generate with AI'}
                    </Button>
                </div>
             </div>

             <div className="space-y-3">
                 <div className="flex gap-2">
                     <input 
                        type="text" 
                        placeholder="Type custom clue..." 
                        className="flex-1 bg-dark-800 border border-white/10 rounded-xl px-4 focus:outline-none focus:border-brand-500"
                        value={customClue}
                        onChange={(e) => setCustomClue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomClue()}
                     />
                     <Button variant="secondary" onClick={addCustomClue}>Add</Button>
                     <Button variant="secondary" onClick={() => setShowImport(!showImport)}>
                         {showImport ? 'Close' : 'Import List'}
                     </Button>
                 </div>
                 
                 {/* Import Section */}
                 {showImport && (
                    <div className="bg-dark-900 p-4 rounded-xl border border-white/10 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between items-center">
                             <h3 className="font-bold text-sm text-white/60">Import Clues</h3>
                             <button onClick={() => setShowImport(false)} className="text-white/40 hover:text-white">✕</button>
                        </div>
                        <textarea
                            className="w-full bg-dark-800 p-3 rounded-lg border border-white/10 h-32 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                            placeholder="Paste list here (one clue per line)..."
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".txt,.csv"
                                onChange={handleFileUpload}
                            />
                            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="text-sm">
                                📁 Load File
                            </Button>
                            <Button onClick={processImport} className="flex-1 text-sm" disabled={!importText.trim()}>
                                Add Clues
                            </Button>
                        </div>
                        <p className="text-[10px] text-white/30">Supports .txt and .csv files.</p>
                    </div>
                 )}
             </div>

             <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {gameState.clues.map((clue, idx) => (
                    <div key={clue.id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg group">
                        <span className="font-medium">{idx + 1}. {clue.text}</span>
                        <button onClick={() => removeClue(clue.id)} className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Delete
                        </button>
                    </div>
                ))}
                {gameState.clues.length === 0 && (
                    <div className="text-center text-white/20 py-8 border-2 border-dashed border-white/10 rounded-xl">
                        No clues yet. Generate or add some!
                    </div>
                )}
             </div>

             <Button fullWidth onClick={beginPlaying} disabled={gameState.clues.length === 0}>
                 Start Playing ({gameState.clues.length} Clues)
             </Button>
        </div>
    );
  }

  if (gameState.phase === GamePhase.PLAYING && gameState.currentTurn) {
      const turn = gameState.currentTurn;
      const team = gameState.teams.find(t => t.id === turn.teamId);
      const actor = gameState.players.find(p => p.id === turn.actorId);

      return (
          <div className="flex flex-col h-full space-y-6">
              {/* Scoreboard */}
              <div className="flex gap-4 justify-between bg-dark-800 p-4 rounded-xl overflow-x-auto">
                  {gameState.teams.map(t => (
                      <div key={t.id} className={`flex-1 text-center p-2 rounded-lg min-w-[80px] ${turn.teamId === t.id ? 'ring-2 ring-white/50 bg-white/5' : ''}`}>
                          <div className={`text-xs font-bold uppercase mb-1 ${t.color.replace('bg-', 'text-')}`}>{t.name}</div>
                          <div className="text-2xl font-black">{t.score}</div>
                      </div>
                  ))}
              </div>

              {/* Action Area */}
              <div className="flex-1 flex flex-col items-center justify-center space-y-6 text-center">
                   {!turn.clue ? (
                        <>
                            <div className="space-y-4">
                                <h3 className="text-xl text-white/60">Next Up:</h3>
                                <div className="bg-gradient-to-br from-white/10 to-transparent p-6 rounded-2xl border border-white/10 inline-flex flex-col items-center gap-4">
                                     <Avatar seed={actor?.avatarSeed || ''} style={actor?.avatarStyle} size={96} />
                                     <div>
                                        <div className="text-2xl font-bold">{actor?.name}</div>
                                        <div className={`${team?.color.replace('bg-', 'text-')} font-bold`}>{team?.name}</div>
                                     </div>
                                </div>
                            </div>
                            <Button onClick={pickClue} className="text-xl py-6 px-12">
                                Reveal Clue
                            </Button>
                        </>
                   ) : (
                       <>
                            {/* HOST CLUE CARD */}
                            <div className="w-full max-w-md bg-white rounded-3xl p-8 text-dark-900 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-brand-500"></div>
                                
                                <div className="flex items-center justify-between mb-4">
                                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Current Clue</div>
                                    <div className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-bold">
                                        Actor: {actor?.name}
                                    </div>
                                </div>

                                <h2 className="text-4xl md:text-5xl font-black break-words leading-tight mb-8">
                                    {turn.clue.text}
                                </h2>
                                
                                {turn.isActive ? (
                                    <div className="text-6xl font-black font-mono text-brand-600 mb-4 animate-pulse-fast">
                                        {turn.timeLeft}s
                                    </div>
                                ) : (
                                    <div className="text-6xl font-black font-mono text-gray-300 mb-4">
                                        {turn.timeLeft}s
                                    </div>
                                )}
                            </div>

                            {!turn.isActive && turn.timeLeft > 0 && (
                                <Button onClick={startTimer} className="w-full max-w-md text-xl">
                                    Start Timer
                                </Button>
                            )}

                            {turn.isActive && (
                                <div className="flex gap-4 w-full max-w-md">
                                    <Button variant="danger" fullWidth onClick={() => markResult(false)}>
                                        Skip / Fail
                                    </Button>
                                    <Button variant="primary" fullWidth onClick={() => markResult(true)}>
                                        Got it!
                                    </Button>
                                </div>
                            )}

                             {/* If time ran out (transition is fast, but just in case of lag) */}
                             {turn.timeLeft === 0 && (
                                 <div className="text-white/50 text-sm">
                                    Time's Up! Moving to next player...
                                 </div>
                             )}
                       </>
                   )}
              </div>

              {/* Controls */}
               <div className="flex flex-col items-center gap-2 w-full pt-4 border-t border-white/5 mt-4">
                   {!turn.clue && (
                     <Button variant="ghost" onClick={nextTurn}>Force Next Player</Button>
                   )}
                   <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs uppercase tracking-wider" onClick={endGame}>
                       End Game Early
                   </Button>
               </div>
          </div>
      );
  }

  return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <h1 className="text-4xl font-bold">Game Over</h1>
          <div className="mt-8 flex gap-8 text-center flex-wrap justify-center">
             {gameState.teams.map(t => (
                 <div key={t.id}>
                     <h2 className="text-2xl mb-2">{t.name}</h2>
                     <p className="text-6xl font-black text-brand-400">{t.score}</p>
                 </div>
             ))}
          </div>
          <Button className="mt-12" onClick={() => window.location.reload()}>Back to Menu</Button>
      </div>
  );
};
