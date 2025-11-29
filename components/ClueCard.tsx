import React from 'react';

interface ClueCardProps {
  text: string;
  category?: string;
  isHidden?: boolean;
}

export const ClueCard: React.FC<ClueCardProps> = ({ text, category, isHidden }) => {
  return (
    <div className="relative w-full max-w-md aspect-[3/2] bg-white rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 text-center overflow-hidden transform transition-all hover:scale-[1.02]">
       {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black to-transparent"></div>
      
      {category && (
        <span className="absolute top-4 text-xs font-bold tracking-widest text-gray-400 uppercase">
          {category}
        </span>
      )}

      {isHidden ? (
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl animate-bounce">👀</div>
          <p className="text-gray-400 font-medium">Watch the actor!</p>
        </div>
      ) : (
        <h2 className="text-4xl md:text-5xl font-black text-gray-800 break-words leading-tight">
          {text}
        </h2>
      )}
    </div>
  );
};
