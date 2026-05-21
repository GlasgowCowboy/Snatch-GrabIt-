import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import AccountDropdown from './AccountDropdown';
import BettingPanel from './BettingPanel';
import { Users, Copy, Check, Bot, LogOut } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { ScoringMethod, UserProfile } from '@shared/schema';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { AIDifficulty } from '@shared/aiPlayer';
import SponsorBanner from './SponsorBanner';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
  isAI?: boolean;
  cardBackImage?: string;
}

interface GameLobbyProps {
  roomCode?: string;
  gameDbId?: string;
  players?: Player[];
  currentPlayerId?: string; // ID of the current logged-in player
  onCreateRoom?: (playerName: string, cardBackImage?: string, scoringMethod?: ScoringMethod, targetScore?: number, aiConfig?: {numAI: number, difficulty: AIDifficulty}) => void;
  onJoinRoom?: (roomCode: string, playerName: string, cardBackImage?: string) => void;
  onStartGame?: () => void;
  onToggleReady?: () => void;
  onLeaveRoom?: () => void;
  isHost?: boolean;
  scoringMethod?: ScoringMethod;
  targetScore?: number;
}

export default function GameLobby({
  roomCode,
  gameDbId,
  players = [],
  currentPlayerId,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  onToggleReady,
  onLeaveRoom,
  isHost = false,
  scoringMethod: initialScoringMethod,
  targetScore: initialTargetScore,
}: GameLobbyProps) {
  const { user } = useAuth();
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['/api/profile'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
  });
  
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [cardBackImage, setCardBackImage] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>(initialScoringMethod || 'fullHand');
  const [targetScore, setTargetScore] = useState<number>(initialTargetScore || 50);
  const [playVsAI, setPlayVsAI] = useState(false);
  const [numAI, setNumAI] = useState(2);
  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');
  
  // Auto-fill display name and card back from profile if user is logged in
  useEffect(() => {
    if (profile) {
      if (profile.displayName && !playerName) {
        setPlayerName(profile.displayName);
      }
      if (profile.cardBackUrl && !cardBackImage) {
        setCardBackImage(profile.cardBackUrl);
      }
    }
  }, [profile]);

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError('');
    
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file (JPG, PNG, GIF, etc.)');
      e.target.value = ''; // Clear the input
      return;
    }
    
    // Check file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      setUploadError(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB (maximum 5MB)`);
      e.target.value = ''; // Clear the input
      return;
    }
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setCardBackImage(reader.result as string);
      setUploadError(''); // Clear any previous errors
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
      e.target.value = ''; // Clear the input
    };
    reader.readAsDataURL(file);
  };

  // Update target score when scoring method changes
  useEffect(() => {
    if (scoringMethod === 'fullHand') {
      setTargetScore(50); // Default to short game
    } else {
      setTargetScore(3); // Default to first to 3
    }
  }, [scoringMethod]);

  const inLobby = !!roomCode;
  const allReady = players.length > 1 && players.every(p => p.isReady);

  return (
    <div className="min-h-screen felt-bg flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <AccountDropdown />
      </div>
      <div className="glass-strong rounded-2xl border border-gold/20 w-full max-w-2xl">
        <div className="p-6 pb-0 text-center">
          <h1 className="text-4xl font-bold text-gradient-gold">
            Snatch&GrabIt!
          </h1>
          <p className="text-gold-light/60 mt-2">
            Competitive Multiplayer Solitaire
            <span className="block text-xs mt-1 text-gold-light/40">Powered by AppSmith</span>
          </p>
        </div>
        <div className="p-6">
          {!inLobby ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  data-testid="input-player-name"
                />
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Card Back Design (Optional)
                  </label>
                  <div className="flex gap-3 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      data-testid="input-card-back"
                      className="flex-1"
                    />
                    {cardBackImage && (
                      <div className="w-12 h-16 rounded-md border border-border overflow-hidden">
                        <img
                          src={cardBackImage}
                          alt="Card back preview"
                          className="w-full h-full object-cover"
                          data-testid="img-card-back-preview"
                        />
                      </div>
                    )}
                  </div>
                  {uploadError && (
                    <p className="text-xs text-destructive" data-testid="text-upload-error">
                      {uploadError}
                    </p>
                  )}
                  {!uploadError && cardBackImage && (
                    <p className="text-xs text-green-600 dark:text-green-400" data-testid="text-upload-success">
                      ✓ Card back uploaded successfully
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload any image file for your card backs. Maximum size: 5MB (no minimum)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Scoring Method
                  </label>
                  <Select value={scoringMethod} onValueChange={(value) => setScoringMethod(value as ScoringMethod)}>
                    <SelectTrigger data-testid="select-scoring-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fullHand">Full Hand Scoring (Complex)</SelectItem>
                      <SelectItem value="round">Round Scoring (Simple)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {scoringMethod === 'fullHand' 
                      ? 'Foundation cards (+1), Remaining cards (-2 each). First out gets +5 bonus.'
                      : 'First player to go out gets 1 point per round.'
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Target Score
                  </label>
                  <Select value={targetScore.toString()} onValueChange={(value) => setTargetScore(Number(value))}>
                    <SelectTrigger data-testid="select-target-score">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scoringMethod === 'fullHand' ? (
                        <>
                          <SelectItem value="50">50 Points (Short Game)</SelectItem>
                          <SelectItem value="100">100 Points (Medium Game)</SelectItem>
                          <SelectItem value="150">150 Points (Long Game)</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="3">First to 3 Rounds</SelectItem>
                          <SelectItem value="5">First to 5 Rounds</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 p-4 glass rounded-lg border border-gold/15">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-gold-light/60" />
                      <Label htmlFor="ai-toggle" className="text-sm font-medium">
                        Play vs AI
                      </Label>
                    </div>
                    <Switch
                      id="ai-toggle"
                      checked={playVsAI}
                      onCheckedChange={setPlayVsAI}
                      data-testid="switch-play-vs-ai"
                    />
                  </div>
                  
                  {playVsAI && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                          Number of AI Opponents
                        </label>
                        <Select value={numAI.toString()} onValueChange={(value) => setNumAI(Number(value))}>
                          <SelectTrigger data-testid="select-num-ai">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 AI Player (2 total)</SelectItem>
                            <SelectItem value="2">2 AI Players (3 total)</SelectItem>
                            <SelectItem value="3">3 AI Players (4 total)</SelectItem>
                            <SelectItem value="4">4 AI Players (5 total)</SelectItem>
                            <SelectItem value="5">5 AI Players (6 total)</SelectItem>
                            <SelectItem value="6">6 AI Players (7 total)</SelectItem>
                            <SelectItem value="7">7 AI Players (8 total)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                          AI Difficulty
                        </label>
                        <Select value={aiDifficulty} onValueChange={(value) => setAIDifficulty(value as AIDifficulty)}>
                          <SelectTrigger data-testid="select-ai-difficulty">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy">Easy (Beginner)</SelectItem>
                            <SelectItem value="medium">Medium (Intermediate)</SelectItem>
                            <SelectItem value="hard">Hard (Advanced)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {aiDifficulty === 'easy' 
                            ? 'AI makes random valid moves'
                            : aiDifficulty === 'medium'
                            ? 'AI prefers foundation moves and tableau organization'
                            : 'AI uses strategic play with optimal move selection'
                          }
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <Button
                  className="w-full btn-gold"
                  onClick={() => onCreateRoom?.(playerName, cardBackImage, scoringMethod, targetScore, playVsAI ? {numAI, difficulty: aiDifficulty} : undefined)}
                  disabled={!playerName.trim()}
                  data-testid="button-create-room"
                >
                  {playVsAI ? `Create AI Game (${numAI + 1} Players)` : 'Create New Room'}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gold/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent backdrop-blur-sm px-3 text-gold-light/50">
                    Or join existing
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Input
                  placeholder="Enter room code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  data-testid="input-room-code"
                />
                <Button
                  className="w-full glass border border-gold/20 text-gold-light hover:border-gold/40 hover:bg-gold/10"
                  variant="secondary"
                  onClick={() => onJoinRoom?.(joinCode, playerName, cardBackImage)}
                  disabled={!playerName.trim() || !joinCode.trim()}
                  data-testid="button-join-room"
                >
                  Join Room
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3 p-4 glass rounded-lg border border-gold/20">
                <span className="text-sm font-medium text-gold-light/60">
                  Room Code:
                </span>
                <Badge variant="outline" className="badge-gold text-lg font-mono px-4 py-2 glow-gold">
                  {roomCode}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyCode}
                  data-testid="button-copy-code"
                  className="text-gold-light/60 hover:text-gold hover:bg-gold/10"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="p-4 glass rounded-lg space-y-2 border border-gold/10">
                <div className="text-sm font-medium text-gold-light/60">Game Settings</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-gold/30 text-gold-light">
                    {scoringMethod === 'fullHand' ? 'Full Hand Scoring' : 'Round Scoring'}
                  </Badge>
                  <Badge variant="outline" className="border-gold/30 text-gold-light">
                    {scoringMethod === 'fullHand'
                      ? `Target: ${targetScore} Points`
                      : `First to ${targetScore} Rounds`
                    }
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gold-light/70">
                  <Users className="w-4 h-4 text-gold" />
                  <span>
                    Players ({players.length}/8)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-3 glass rounded-md border border-gold/10"
                      data-testid={`player-slot-${player.id}`}
                    >
                      <span className="text-sm font-medium text-gold-light">{player.name}</span>
                      {player.isReady && (
                        <Badge variant="default" className="text-xs badge-gold">
                          Ready
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Betting Panel - Only show when there are 2+ players and user is logged in */}
              {players.length >= 2 && user && currentPlayerId && (
                <BettingPanel
                  players={players}
                  currentPlayerId={currentPlayerId}
                  gameId={gameDbId ?? roomCode ?? ''}
                />
              )}

              {/* Sponsor Banner */}
              <SponsorBanner className="my-4" />

              <div className="flex gap-3">
                {onLeaveRoom && (
                  <Button
                    variant="ghost"
                    className="text-gold-light/60 hover:text-destructive hover:bg-destructive/10"
                    onClick={onLeaveRoom}
                    data-testid="button-leave-room"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Leave
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1 glass border-gold/20 text-gold-light hover:border-gold/40 hover:bg-gold/10"
                  onClick={onToggleReady}
                  data-testid="button-toggle-ready"
                >
                  {players[0]?.isReady ? 'Not Ready' : 'Ready'}
                </Button>
                {isHost && (
                  <Button
                    className="flex-1 btn-gold"
                    onClick={onStartGame}
                    disabled={!allReady}
                    data-testid="button-start-game"
                  >
                    Start Game
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
