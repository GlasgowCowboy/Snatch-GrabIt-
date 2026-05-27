import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  UserCircle,
  Sparkles,
  Hash,
  Bot,
  ChevronLeft,
  Trophy,
  Zap,
  Flame,
} from 'lucide-react';
import { ScoringMethod } from '@shared/schema';
import { AIDifficulty } from '@shared/aiPlayer';
import PendingInvites from './PendingInvites';

/**
 * Multi-step landing replacing the old "one giant form" screen.
 *
 * Steps:
 *   choose   — pick what kind of session: sign-in / quick-play / join-code.
 *              Logged-in users see "new game" / "join code" instead.
 *   identity — guest-only: enter a display name + optional card back.
 *              Logged-in users skip this entirely (profile fields are used).
 *   code     — paste the 6-char room code (used both when joining and after
 *              identity if user chose "join with code").
 *   setup    — game settings the room creator picks: scoring, target, vs AI.
 *
 * The component owns ALL transient form state; the parent only sees the two
 * callbacks (onCreateRoom, onJoinRoom) fired with the final values.
 */

interface LandingScreenProps {
  initialJoinCode?: string;
  isLoggedIn: boolean;
  /** When logged in, profile values pre-fill identity so the user skips that step. */
  profileDisplayName?: string;
  profileCardBack?: string;
  onCreateRoom: (
    playerName: string,
    cardBackImage: string | undefined,
    scoringMethod: ScoringMethod,
    targetScore: number,
    aiConfig?: { numAI: number; difficulty: AIDifficulty },
  ) => void;
  onJoinRoom: (
    roomCode: string,
    playerName: string,
    cardBackImage: string | undefined,
  ) => void;
}

type Step = 'choose' | 'identity-create' | 'identity-join' | 'code' | 'setup';

const MAX_CARD_BACK_BYTES = 1 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LandingScreen({
  initialJoinCode,
  isLoggedIn,
  profileDisplayName,
  profileCardBack,
  onCreateRoom,
  onJoinRoom,
}: LandingScreenProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>('choose');
  const [playerName, setPlayerName] = useState(profileDisplayName ?? '');
  const [cardBackImage, setCardBackImage] = useState<string>(profileCardBack ?? '');
  const [uploadedFileLabel, setUploadedFileLabel] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>(initialJoinCode?.toUpperCase() ?? '');
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('fullHand');
  const [targetScore, setTargetScore] = useState<number>(50);
  const [playVsAI, setPlayVsAI] = useState(false);
  const [numAI, setNumAI] = useState(2);
  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');

  // Keep playerName + cardBack synced to profile when it loads asynchronously.
  useEffect(() => {
    if (profileDisplayName && !playerName) setPlayerName(profileDisplayName);
    if (profileCardBack && !cardBackImage) setCardBackImage(profileCardBack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileDisplayName, profileCardBack]);

  // Deep-link: ?join=CODE drops the user straight to the code step.
  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode.toUpperCase());
      // Logged-in: skip identity, go right to code-confirm.
      // Guest: need identity first.
      setStep(isLoggedIn ? 'code' : 'identity-join');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError('');
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError(`Unsupported file type (${file.type || 'unknown'}). Use a JPG, PNG, GIF, or WebP image.`);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_CARD_BACK_BYTES) {
      setUploadError(
        `Image is ${formatFileSize(file.size)} — please choose one under ${formatFileSize(MAX_CARD_BACK_BYTES)}.`,
      );
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '');
      setCardBackImage(dataUrl);
      setUploadedFileLabel(`${file.name} (${formatFileSize(file.size)})`);
    };
    reader.readAsDataURL(file);
  };

  const handleClearCardBack = () => {
    setCardBackImage('');
    setUploadedFileLabel('');
  };

  // ── Step renderers ───────────────────────────────────────────────────────

  const renderChoose = () => (
    <div className="space-y-5">
      <Hero />

      <PendingInvites
        onAccept={(code) => {
          setJoinCode(code);
          setStep(isLoggedIn ? 'code' : 'identity-join');
        }}
      />

      <div className="space-y-3">
        {!isLoggedIn && (
          <PathCard
            icon={<UserCircle className="w-5 h-5" />}
            title="Sign in / create account"
            sub="Earn credits, track stats, climb the leaderboard."
            accent="gold"
            testid="path-signin"
            onClick={() => navigate('/auth')}
          />
        )}

        <PathCard
          icon={<Sparkles className="w-5 h-5" />}
          title={isLoggedIn ? 'New game' : 'Quick play as guest'}
          sub={
            isLoggedIn
              ? 'Set up a new game vs AI or invite friends.'
              : 'Jump in without an account. No chips, no stats — just play.'
          }
          accent="emerald"
          testid="path-create"
          onClick={() => setStep(isLoggedIn ? 'setup' : 'identity-create')}
        />

        <PathCard
          icon={<Hash className="w-5 h-5" />}
          title="Join with a code"
          sub="A friend sent you a 6-character room code? Paste it here."
          accent="cyan"
          testid="path-join"
          onClick={() => setStep(isLoggedIn ? 'code' : 'identity-join')}
        />
      </div>
    </div>
  );

  const renderIdentity = (nextStep: 'setup' | 'code') => (
    <div className="space-y-5">
      <StepHeader
        title={nextStep === 'setup' ? 'What should we call you?' : 'Quick details before joining'}
        sub="Just a display name. You can change it any time by signing up."
        onBack={() => setStep('choose')}
      />

      <div className="space-y-2">
        <Label htmlFor="player-name">Display name</Label>
        <Input
          id="player-name"
          placeholder="e.g. Scoyy"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          data-testid="input-player-name"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-back">Card back (optional)</Label>
        <div className="flex gap-3 items-center">
          <Input
            id="card-back"
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
          <p className="text-xs text-destructive" data-testid="text-upload-error" role="alert">
            {uploadError}
          </p>
        )}
        {!uploadError && cardBackImage && uploadedFileLabel && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-emerald-500 truncate" data-testid="text-upload-success">
              ✓ Ready to use — {uploadedFileLabel}
            </span>
            <button
              type="button"
              onClick={handleClearCardBack}
              data-testid="button-clear-card-back"
              className="text-muted-foreground hover:text-destructive underline shrink-0"
            >
              Remove
            </button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">JPG, PNG, GIF, or WebP — max 1 MB.</p>
      </div>

      <Button
        className="w-full btn-gold"
        onClick={() => setStep(nextStep)}
        disabled={!playerName.trim()}
        data-testid="button-identity-continue"
      >
        Continue
      </Button>
    </div>
  );

  const renderCode = () => (
    <div className="space-y-5">
      <StepHeader
        title="Got a room code?"
        sub="Paste the 6-character code your friend shared."
        onBack={() => setStep(isLoggedIn ? 'choose' : 'identity-join')}
      />
      <div className="space-y-2">
        <Label htmlFor="room-code">Room code</Label>
        <Input
          id="room-code"
          placeholder="ABCDEF"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={16}
          data-testid="input-room-code"
          autoFocus
          className="uppercase tracking-widest text-center text-lg font-mono"
        />
      </div>
      <Button
        className="w-full btn-gold"
        onClick={() => onJoinRoom(joinCode, playerName, cardBackImage || undefined)}
        disabled={!playerName.trim() || !joinCode.trim()}
        data-testid="button-join-room"
      >
        Join room
      </Button>
    </div>
  );

  const renderSetup = () => (
    <div className="space-y-5">
      <StepHeader
        title="Set up your game"
        sub="Choose how you want to play. You can change settings between rounds in the lobby."
        onBack={() => setStep(isLoggedIn ? 'choose' : 'identity-create')}
      />

      <div className="space-y-2">
        <Label>Scoring method</Label>
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
            : 'First player to go out gets 1 point per round.'}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Target score</Label>
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
              <Label>Number of AI opponents</Label>
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
              <Label>AI difficulty</Label>
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
            </div>
          </>
        )}
      </div>

      <Button
        className="w-full btn-gold"
        onClick={() =>
          onCreateRoom(
            playerName,
            cardBackImage || undefined,
            scoringMethod,
            targetScore,
            playVsAI ? { numAI, difficulty: aiDifficulty } : undefined,
          )
        }
        disabled={!playerName.trim()}
        data-testid="button-create-room"
      >
        {playVsAI ? `Create AI game (${numAI + 1} players)` : 'Create room'}
      </Button>
    </div>
  );

  // ── Composition ──────────────────────────────────────────────────────────

  switch (step) {
    case 'choose':
      return renderChoose();
    case 'identity-create':
      return renderIdentity('setup');
    case 'identity-join':
      return renderIdentity('code');
    case 'code':
      return renderCode();
    case 'setup':
      return renderSetup();
  }
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="space-y-3 text-center pb-1">
      <p className="text-sm md:text-base text-gold-light/80 leading-relaxed max-w-md mx-auto">
        Race opponents to empty your <strong>bone pile</strong> first by building shared
        foundations Ace → King. Three minutes a round. Bet virtual chips for fun.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-wide text-gold-light/60">
        <Pill icon={<Trophy className="w-3 h-3" />} label="Competitive" />
        <Pill icon={<Zap className="w-3 h-3" />} label="Real-time" />
        <Pill icon={<Flame className="w-3 h-3" />} label="2-8 players" />
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold/10 border border-gold/20">
      {icon}
      {label}
    </span>
  );
}

function StepHeader({
  title,
  sub,
  onBack,
}: {
  title: string;
  sub: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onBack}
        data-testid="button-step-back"
        className="text-xs text-gold-light/60 hover:text-gold flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" />
        Back
      </button>
      <h2 className="text-lg font-semibold text-gold-light">{title}</h2>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function PathCard({
  icon,
  title,
  sub,
  accent,
  testid,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  accent: 'gold' | 'emerald' | 'cyan';
  testid: string;
  onClick: () => void;
}) {
  const accentClass =
    accent === 'gold'
      ? 'border-gold/30 hover:border-gold/60 hover:bg-gold/5 text-gold-light'
      : accent === 'emerald'
      ? 'border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5 text-emerald-300'
      : 'border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/5 text-cyan-300';

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`w-full text-left p-4 rounded-xl border-2 glass transition-colors flex items-start gap-3 ${accentClass}`}
    >
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold text-base">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>
      </span>
    </button>
  );
}
