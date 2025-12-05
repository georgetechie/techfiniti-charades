
import React, { useState, useEffect } from 'react';
import { Player, GamePhase } from './types';
import { LandingView } from './views/Landing';
import { HostView } from './views/HostView';
import { PlayerView } from './views/PlayerView';
import { SingleDeviceView } from './views/SingleDeviceView';

export default function App() {
  const [role, setRole] = useState<'NONE' | 'HOST' | 'PLAYER' | 'SINGLE'>('NONE');
  const [roomCode, setRoomCode] = useState<string>('');
  const [playerInfo, setPlayerInfo] = useState<Player | null>(null);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setInitialJoinCode(code);
    }
  }, []);

  const handleHostCreate = (code: string, hostPlayer: Player) => {
    setRoomCode(code);
    setPlayerInfo(hostPlayer);
    setRole('HOST');
  };

  const handlePlayerJoin = (code: string, player: Player) => {
    setRoomCode(code);
    setPlayerInfo(player);
    setRole('PLAYER');
  };

  const handleSingleDevice = () => {
      setRole('SINGLE');
  };

  const handleLeave = () => {
    setRole('NONE');
    setRoomCode('');
    setPlayerInfo(null);
    window.location.href = window.location.pathname; // Clear params on exit
  };

  return (
    <div className="min-h-screen bg-dark-900 text-white flex flex-col">
      <header className="p-4 border-b border-white/5 flex justify-between items-center bg-dark-800/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center font-bold text-xl">C</div>
            <h1 className="font-bold text-lg tracking-tight">Charades AI</h1>
        </div>
        {role !== 'NONE' && (
             <div className="flex items-center gap-4">
                 {role !== 'SINGLE' && <span className="hidden sm:inline-block text-sm text-white/50">Room: <strong className="text-white">{roomCode}</strong></span>}
                 <button onClick={handleLeave} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-colors">
                    Exit
                 </button>
             </div>
        )}
      </header>

      <main className="flex-1 flex flex-col p-4 md:p-6 max-w-5xl mx-auto w-full">
        {role === 'NONE' && (
          <LandingView 
            onHost={handleHostCreate} 
            onJoin={handlePlayerJoin} 
            onSingleDevice={handleSingleDevice}
            initialCode={initialJoinCode}
          />
        )}
        {role === 'HOST' && playerInfo && (
          <HostView roomCode={roomCode} hostPlayer={playerInfo} />
        )}
        {role === 'PLAYER' && playerInfo && (
          <PlayerView roomCode={roomCode} player={playerInfo} />
        )}
        {role === 'SINGLE' && (
            <SingleDeviceView onExit={handleLeave} />
        )}
      </main>
      
      {/* Disclaimer for demo environment */}
      {role !== 'NONE' && role !== 'SINGLE' && (
        <div className="fixed bottom-2 right-2 text-[10px] text-white/20 max-w-[200px] text-right pointer-events-none">
            Demo Mode: Open this URL in another tab to join as a player.
        </div>
      )}
    </div>
  );
}