
import React from 'react';
import { usePlayerGame } from '../services/network';
import { Player, GamePhase } from '../types';
import { Avatar } from '../components/Avatar';
import { ClueCard } from '../components/ClueCard';
import { Button } from '../components/Button';
import { INITIAL_ROUND_TIME } from '../constants';

interface PlayerViewProps {
  roomCode: string;
  player: Player;
}

export const PlayerView: React.FC<PlayerViewProps> = ({ roomCode, player }) => {
  const { gameState, sendAction, error, isConnected, reconnect } = usePlayerGame(roomCode, player);

  if (error) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
              <div className="text-4xl text-red-500">⚠️</div>
              <h2 className="text-2xl font-bold">Connection Error</h2>
              <p className="text-white/60">{error}</p>
              <div className="flex gap-2 mt-4">
                  <Button onClick={reconnect} className="min-w-[120px]">
                      Try Again
                  </Button>
                  <Button onClick={() => window.location.reload()} variant="secondary">
                      Refresh Page
                  </Button>
              </div>
          </div>
      );
  }

  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 animate-pulse">
        <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <h2 className="text-xl font-bold">Connecting to Room {roomCode}...</h2>
        <Button onClick={reconnect} variant="ghost" className="text-sm text-white/40 hover:text-white mt-4">
            Stuck? Click to Retry
        </Button>
      </div>
    );
  }

  // Check if player is still in the game (might have been kicked)
  const meInState = gameState.players.find(p => p.id === player.id);
  
  if (!meInState && gameState.phase !== GamePhase.FINISHED) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
              <div className="text-6xl text-gray-500">🚫</div>
              <h2 className="text-2xl font-bold">You have been removed</h2>
              <p className="text-white/50">The moderator has removed you from the game.</p>
              <Button onClick={() => window.location.reload()} variant="secondary" className="mt-4">
                  Back to Menu
              </Button>
          </div>
      );
  }

  const myRealTeamId = meInState?.teamId;

  return (
    <div className="relative w-full">
        {/* Connection Status Banner */}
        {!isConnected && (
            <div className="absolute top-[-16px] left-0 right-0 bg-red-500/90 text-white text-xs font-bold py-1 px-4 text-center z-50 rounded-b-lg flex items-center justify-center gap-2">
                <span>⚠️ Connection lost. Reconnecting...</span>
                <button onClick={reconnect} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded uppercase tracking-wider text-[10px]">
                    Retry Now
                </button>
            </div>
        )}

        {/* --- LOBBY --- */}
        {gameState.phase === GamePhase.LOBBY && (
          <div className="flex flex-col items-center space-y-8 py-10">
             <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">You're In!</h2>
                <p className="text-white/50">Waiting for host to start...</p>
             </div>
             
             <div className="relative">
                 <Avatar seed={player.avatarSeed} style={player.avatarStyle} size={120} className="ring-4 ring-brand-500" />
                 {myRealTeamId && (
                     <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg whitespace-nowrap ${myRealTeamId === 'team-a' ? 'bg-pink-500' : 'bg-cyan-500'}`}>
                         {gameState.teams.find(t => t.id === myRealTeamId)?.name}
                     </div>
                 )}
             </div>

             <div className="w-full max-w-sm bg-dark-800 rounded-2xl p-6 border border-white/5">
                <h3 className="text-sm font-bold text-white/40 uppercase mb-4 text-center">Players in Lobby ({gameState.players.length})</h3>
                <div className="flex flex-wrap justify-center gap-2">
                    {gameState.players.map(p => (
                        <div key={p.id} className={`w-10 h-10 rounded-full overflow-hidden border-2 ${p.id === player.id ? 'border-brand-400' : 'border-white/10'}`}>
                            <Avatar seed={p.avatarSeed} style={p.avatarStyle} size={40} className="w-full h-full" />
                        </div>
                    ))}
                </div>
             </div>
          </div>
        )}

        {/* --- SETUP --- */}
        {gameState.phase === GamePhase.SETUP && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="text-6xl mb-4">⚙️</div>
              <h2 className="text-2xl font-bold">Host is setting up...</h2>
              <p className="text-white/50 mt-2">Get ready to act!</p>
          </div>
        )}

        {/* --- PLAYING --- */}
        {gameState.phase === GamePhase.PLAYING && gameState.currentTurn && (
          (() => {
              const turn = gameState.currentTurn;
              const isMyTurn = turn.actorId === player.id;
              const actor = gameState.players.find(p => p.id === turn.actorId);
              const activeTeam = gameState.teams.find(t => t.id === turn.teamId);
              const isMyTeamTurn = myRealTeamId === turn.teamId;
              const canControl = gameState.settings.allowPlayerControl;
              const totalTime = gameState.settings?.roundTime || INITIAL_ROUND_TIME;

              return (
                  <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 w-full max-w-md mx-auto">
                      
                      {/* Status Header */}
                      <div className="bg-dark-800 px-4 py-2 rounded-full border border-white/10 text-xs font-bold flex items-center gap-2 relative z-10 shadow-lg">
                           <span className="text-white/50">R{turn.roundNumber}</span>
                           <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                           <span className={`${activeTeam?.color.replace('bg-', 'text-')} font-black uppercase tracking-wider`}>
                               {activeTeam?.name}
                           </span>
                           <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                           <span className={isMyTeamTurn ? 'text-green-400' : 'text-white/50'}>
                               {isMyTeamTurn ? 'You' : 'Opponent'}
                           </span>
                      </div>

                      {isMyTurn ? (
                          // ACTOR VIEW
                          <div className="w-full space-y-6">
                              <div className="text-center">
                                  <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">
                                      IT'S YOU!
                                  </h2>
                                  <p className="text-white/60 mt-2">You are acting.</p>
                              </div>

                              <div className="flex flex-col items-center justify-center gap-6">
                                  {turn.clue ? (
                                      <>
                                        <ClueCard text={turn.clue.text} category="Current Clue" />
                                        
                                        <div className="text-center w-full relative z-20">
                                             <p className="text-sm text-white/40 uppercase font-bold tracking-widest mb-2">Time Remaining</p>
                                             <div className={`text-5xl font-mono font-black mb-6 ${turn.timeLeft < 10 ? 'text-red-500' : 'text-white'}`}>
                                                 {turn.timeLeft}
                                             </div>
                                             
                                             {!turn.isActive && turn.timeLeft > 0 && (
                                                 <Button onClick={() => sendAction('START_TIMER')} className="text-xl w-full max-w-xs animate-bounce-small relative z-30">
                                                     Start Timer
                                                 </Button>
                                             )}

                                             {/* Player Control Buttons */}
                                             {canControl && turn.isActive && (
                                                 <div className="flex gap-4 w-full max-w-xs mx-auto relative z-30">
                                                    <Button variant="danger" fullWidth onClick={() => sendAction('MARK_RESULT', { success: false })}>
                                                        Skip / Fail
                                                    </Button>
                                                    <Button variant="primary" fullWidth onClick={() => sendAction('MARK_RESULT', { success: true })}>
                                                        Got it!
                                                    </Button>
                                                 </div>
                                             )}
                                        </div>
                                      </>
                                  ) : (
                                       <div className="w-full flex flex-col items-center gap-6 relative z-20">
                                           <div className="w-full aspect-[3/2] bg-dark-800 rounded-3xl flex items-center justify-center border-2 border-dashed border-white/10">
                                               <p className="text-white/40">Clue hidden...</p>
                                           </div>
                                           <Button onClick={() => sendAction('REVEAL_CLUE')} className="text-xl w-full max-w-xs relative z-30">
                                               Reveal Clue
                                           </Button>
                                       </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          // GUESSER VIEW
                          <div className="w-full space-y-6 text-center">
                              <div className="flex flex-col items-center gap-4">
                                   <Avatar seed={actor?.avatarSeed || ''} style={actor?.avatarStyle} size={120} className="ring-4 ring-white/10" />
                                   <div>
                                       <h3 className="text-2xl font-bold">{actor?.name}</h3>
                                       <p className="text-brand-400 font-medium">is acting</p>
                                   </div>
                              </div>

                              <div className="py-8">
                                   {turn.isActive ? (
                                       <div className={`text-3xl md:text-4xl font-bold ${isMyTeamTurn ? 'animate-pulse text-white' : 'text-white/50'}`}>
                                           {isMyTeamTurn 
                                               ? (gameState.settings.guessingMessage || "GUESS NOW!")
                                               : (gameState.settings.opposingTeamMessage || "Opposing Team Guessing")
                                           }
                                       </div>
                                   ) : (
                                       <p className="text-white/40">Get ready to guess...</p>
                                   )}
                              </div>
                              
                              {/* Timer Bar */}
                               <div className="w-full bg-dark-800 rounded-full h-4 overflow-hidden">
                                   <div 
                                        className="h-full bg-brand-500 transition-all duration-1000 ease-linear"
                                        style={{ width: `${(turn.timeLeft / totalTime) * 100}%` }}
                                   ></div>
                               </div>
                          </div>
                      )}
                  </div>
              );
          })()
        )}

        {/* --- FINISHED --- */}
        {gameState.phase === GamePhase.FINISHED && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
              <div className="text-6xl">🏆</div>
              <h2 className="text-2xl font-bold">Game Finished</h2>
              <p className="text-white/50">Look at the host screen for results!</p>
              <Button onClick={() => window.location.reload()} variant="secondary" className="mt-4">
                  Main Menu
              </Button>
          </div>
        )}
    </div>
  );
};
