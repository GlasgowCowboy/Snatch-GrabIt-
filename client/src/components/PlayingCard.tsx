import { useState, useEffect } from 'react';
import { Card } from '@shared/schema';
import { Heart, Diamond, Spade as SpadeIcon, Club } from 'lucide-react';

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  isEmpty?: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
  className?: string;
  cardBackImage?: string;
  disabled?: boolean;
  animationType?: 'flip' | 'bounce' | 'shake' | 'pop' | 'slide-in' | 'none';
  isValidDrop?: boolean;
}

export default function PlayingCard({
  card,
  faceDown = false,
  isEmpty = false,
  isHighlighted = false,
  onClick,
  className = '',
  cardBackImage,
  disabled = false,
  animationType = 'none',
  isValidDrop = false,
}: PlayingCardProps) {
  const [currentAnimation, setCurrentAnimation] = useState(animationType);
  const isRed = card?.suit === 'hearts' || card?.suit === 'diamonds';

  useEffect(() => {
    if (animationType !== 'none') {
      setCurrentAnimation(animationType);
    }
  }, [animationType]);

  const handleAnimationEnd = () => {
    setCurrentAnimation('none');
  };

  const getAnimationClass = () => {
    switch (currentAnimation) {
      case 'flip': return 'animate-card-flip';
      case 'bounce': return 'animate-bounce';
      case 'shake': return 'animate-shake';
      case 'pop': return 'animate-pop';
      case 'slide-in': return 'animate-slide-in';
      default: return '';
    }
  };

  const getSuitIcon = (suit: string, size: string = 'w-3.5 h-3.5') => {
    switch (suit) {
      case 'hearts':
        return <Heart className={size} fill="currentColor" />;
      case 'diamonds':
        return <Diamond className={size} fill="currentColor" />;
      case 'clubs':
        return <Club className={size} fill="currentColor" />;
      case 'spades':
        return <SpadeIcon className={size} fill="currentColor" />;
      default:
        return null;
    }
  };

  // Empty slot — gold dashed border with subtle glow
  if (isEmpty) {
    return (
      <div
        onClick={disabled ? undefined : onClick}
        className={`w-16 h-24 rounded-lg border-2 border-dashed border-gold/30 bg-white/[0.02] ${
          disabled ? 'cursor-not-allowed opacity-50' : onClick ? 'cursor-pointer hover:border-gold/50 hover:bg-white/[0.04]' : ''
        } ${isValidDrop ? 'animate-valid-drop' : ''} transition-all duration-200 ${className}`}
        data-testid="card-empty"
        aria-disabled={disabled}
      />
    );
  }

  // Face-down — premium card back with pattern or custom image
  if (faceDown) {
    // Preset card back — applied as a CSS class instead of an <img>. Avoids
    // serving a base64 image per card for the common case where players just
    // pick one of the bundled designs.
    if (cardBackImage?.startsWith('preset:')) {
      const presetId = cardBackImage.slice('preset:'.length);
      return (
        <div
          onClick={disabled ? undefined : onClick}
          onAnimationEnd={handleAnimationEnd}
          className={`relative w-16 h-24 rounded-lg overflow-hidden card-back-preset-${presetId} card-3d border-2 border-gold/30 ${
            disabled ? 'cursor-not-allowed opacity-50' : onClick ? 'cursor-pointer hover:card-3d-hover hover:-translate-y-0.5 hover:border-gold/50 active:translate-y-0' : ''
          } transition-all duration-200 ${getAnimationClass()} ${className}`}
          data-testid="card-facedown"
          aria-disabled={disabled}
        />
      );
    }
    if (cardBackImage) {
      return (
        <div
          onClick={disabled ? undefined : onClick}
          onAnimationEnd={handleAnimationEnd}
          className={`w-16 h-24 rounded-lg card-3d overflow-hidden border-2 border-gold/30 ${
            disabled ? 'cursor-not-allowed opacity-50' : onClick ? 'cursor-pointer hover:card-3d-hover hover:-translate-y-0.5 hover:border-gold/50 active:translate-y-0' : ''
          } transition-all duration-200 ${getAnimationClass()} ${className}`}
          data-testid="card-facedown"
          aria-disabled={disabled}
        >
          <img
            src={cardBackImage}
            alt="Card back"
            className="w-full h-full object-cover"
          />
        </div>
      );
    }

    // Default card back — purple gradient with gold diamond pattern
    return (
      <div
        onClick={disabled ? undefined : onClick}
        onAnimationEnd={handleAnimationEnd}
        className={`w-16 h-24 rounded-lg card-back-pattern card-3d border-2 border-gold/30 ${
          disabled ? 'cursor-not-allowed opacity-50' : onClick ? 'cursor-pointer hover:card-3d-hover hover:-translate-y-0.5 hover:border-gold/50 active:translate-y-0' : ''
        } transition-all duration-200 ${getAnimationClass()} ${className}`}
        data-testid="card-facedown"
        aria-disabled={disabled}
      />
    );
  }

  // Face-up — premium white card with 3D depth
  return (
    <div
      onClick={onClick}
      onAnimationEnd={handleAnimationEnd}
      className={`
        w-16 h-24 rounded-lg card-3d
        flex flex-col justify-between p-1.5 relative
        transition-all duration-200 ease-out
        ${onClick ? 'cursor-pointer hover:-translate-y-1.5 hover:card-3d-hover hover:scale-[1.04] active:translate-y-0 active:scale-100' : ''}
        ${isHighlighted
          ? 'border-2 border-gold scale-105 -translate-y-1 animate-pulse-glow z-10'
          : 'border border-white/20'}
        ${getAnimationClass()}
        ${className}
      `}
      style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #f8f6f0 100%)',
      }}
      data-testid={`card-${card?.rank}-${card?.suit}`}
    >
      {/* Top-left rank + suit */}
      <div className={`flex flex-col items-start ${isRed ? 'text-red-500' : 'text-slate-800'}`}>
        <div className="text-base font-extrabold leading-none tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
          {card?.rank}
        </div>
        <div className="mt-0.5">
          {card && getSuitIcon(card.suit)}
        </div>
      </div>

      {/* Center suit icon (large, subtle) */}
      <div className={`absolute inset-0 flex items-center justify-center opacity-[0.08] pointer-events-none ${isRed ? 'text-red-500' : 'text-slate-800'}`}>
        {card && getSuitIcon(card.suit, 'w-10 h-10')}
      </div>

      {/* Bottom-right rank + suit (rotated) */}
      <div className={`flex flex-col items-start self-end rotate-180 ${isRed ? 'text-red-500' : 'text-slate-800'}`}>
        <div className="text-base font-extrabold leading-none tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
          {card?.rank}
        </div>
        <div className="mt-0.5">
          {card && getSuitIcon(card.suit)}
        </div>
      </div>
    </div>
  );
}
