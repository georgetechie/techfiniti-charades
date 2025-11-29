
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player } from '../types';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { AVATAR_STYLES } from '../constants';

interface LandingProps {
  onHost: (code: string, player: Player) => void;
  onJoin: (code: string, player: Player) => void;
}

export const LandingView: React.FC<LandingProps> = ({ onHost, onJoin }) => {
  // Initialize state from local storage to persist identity across refreshes
  const [name, setName] = useState(() => localStorage.getItem('charades_username') || '');
  
  const [playerId] = useState(() => {
    let id = localStorage.getItem('charades_userid');
    if (!id) {
        id = uuidv4();
        localStorage.setItem('charades_userid', id);
    }
    return id;
  });

  const [seed, setSeed] = useState(() => {
    let s = localStorage.getItem('charades_avatar_seed');
    if (!s) {
        s = uuidv4();
        localStorage.setItem('charades_avatar_seed', s);
    }
    return s;
  });

  const [avatarStyle, setAvatarStyle] = useState(() => {
      return localStorage.getItem('charades_avatar_style') || AVATAR_STYLES[0];
  });

  const [mode, setMode] = useState<'MENU' | 'JOIN'>('MENU');
  const [joinCode, setJoinCode] = useState('');

  // Persist name whenever it changes
  useEffect(() => {
    localStorage.setItem('charades_username', name);
  }, [name]);

  // Persist avatar settings
  useEffect(() => {
      localStorage.setItem('charades_avatar_seed', seed);
      localStorage.setItem('charades_avatar_style', avatarStyle);
  }, [seed, avatarStyle]);

  const randomizeAvatar = () => {
      setSeed(uuidv4());
  };

  const changeStyle = (direction: 'prev' | 'next') => {
      const currentIndex = AVATAR_STYLES.indexOf(avatarStyle);
      let nextIndex;
      if (direction === 'next') {
          nextIndex = (currentIndex + 1) % AVATAR_STYLES.length;
      } else {
          nextIndex = (currentIndex - 1 + AVATAR_STYLES.length) % AVATAR_STYLES.length;
      }
      setAvatarStyle(AVATAR_STYLES[nextIndex]);
  };

  const createGame = () => {
    if (!name) return alert('Please enter your name');
    // Generate a simple 4 digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const player: Player = {
      id: playerId,
      name,
      avatarSeed: seed,
      avatarStyle,
      isHost: true
    };
    onHost(code, player);
  };

  const joinGame = () => {
    if (!name) return alert('Please enter your name');
    if (!joinCode || joinCode.length !== 4) return alert('Please enter a valid 4-digit room code');
    
    const player: Player = {
      id: playerId,
      name,
      avatarSeed: seed,
      avatarStyle,
      isHost: false
    };
    onJoin(joinCode, player);
  };

  const clearIdentity = () => {
      if(confirm('This will clear your saved name and avatar. Continue?')) {
          localStorage.removeItem('charades_username');
          localStorage.removeItem('charades_userid');
          localStorage.removeItem('charades_avatar_seed');
          localStorage.removeItem('charades_avatar_style');
          window.location.reload();
      }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">
          Ready to Play?
        </h2>
        <p className="text-white/60">The ultimate AI-powered party game.</p>
      </div>

      <div className="w-full bg-dark-800 p-6 rounded-3xl border border-white/5 shadow-2xl space-y-6">
        
        {/* Profile Setup */}
        <div className="flex flex-col items-center gap-4 relative group">
            <div className="relative">
                <Avatar seed={seed} style={avatarStyle} size={100} />
                <button 
                    onClick={clearIdentity}
                    className="absolute -top-2 -right-2 bg-dark-700 rounded-full p-1 text-xs text-white/50 hover:text-red-400 hover:bg-dark-600 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reset Identity"
                >
                    ✕
                </button>
            </div>

            {/* Avatar Controls */}
            <div className="flex items-center gap-2 bg-dark-900/50 rounded-xl p-1 border border-white/5">
                <button 
                    onClick={() => changeStyle('prev')}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                    ◀
                </button>
                <div className="text-xs font-bold uppercase tracking-wider text-white/70 w-24 text-center select-none">
                    {avatarStyle}
                </div>
                <button 
                    onClick={() => changeStyle('next')}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                    ▶
                </button>
                <div className="w-px h-6 bg-white/10 mx-1"></div>
                <button 
                    onClick={randomizeAvatar}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-brand-300 transition-colors"
                    title="Randomize Appearance"
                >
                    🎲
                </button>
            </div>

            <input
                type="text"
                placeholder="Enter your name"
                className="w-full bg-dark-900 border border-white/10 rounded-xl px-4 py-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all placeholder:text-white/20"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
            />
        </div>

        {mode === 'MENU' ? (
            <div className="space-y-3 pt-4">
                <Button fullWidth onClick={createGame} disabled={!name}>
                    Host a New Game
                </Button>
                <Button fullWidth variant="secondary" onClick={() => setMode('JOIN')} disabled={!name}>
                    Join Existing Game
                </Button>
            </div>
        ) : (
            <div className="space-y-4 pt-4 animate-in fade-in zoom-in duration-300">
                 <div>
                    <label className="text-xs font-bold text-white/50 uppercase ml-1 mb-1 block">Room Code</label>
                    <input
                        type="number"
                        placeholder="0000"
                        className="w-full bg-dark-900 border border-white/10 rounded-xl px-4 py-4 text-center font-black text-3xl tracking-[1em] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all placeholder:text-white/10"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.slice(0, 4))}
                    />
                 </div>
                <Button fullWidth onClick={joinGame} disabled={!name || joinCode.length !== 4}>
                    Enter Room
                </Button>
                <Button fullWidth variant="ghost" onClick={() => setMode('MENU')}>
                    Back
                </Button>
            </div>
        )}
      </div>
      
      <div className="text-center text-xs text-white/20">
          ID: {playerId.slice(0,8)}...
      </div>
    </div>
  );
};
