
import React from 'react';

interface AvatarProps {
  seed: string;
  style?: string;
  size?: number;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ seed, style = 'notionists', size = 48, className = "" }) => {
  // Use a reliable avatar service with dynamic style
  // Fallback to 'notionists' if style is undefined or empty
  const safeStyle = style || 'notionists';
  const src = `https://api.dicebear.com/9.x/${safeStyle}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

  return (
    <div 
      className={`rounded-full overflow-hidden border-2 border-white/20 shadow-lg bg-gray-700 ${className}`}
      style={{ width: size, height: size }}
    >
      <img src={src} alt="Avatar" className="w-full h-full object-cover" />
    </div>
  );
};
