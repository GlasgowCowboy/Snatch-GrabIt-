import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import AccountDropdown from './AccountDropdown';
import ThemeToggle from './ThemeToggle';
import InstallAppButton from './InstallAppButton';
import BettingPanel from './BettingPanel';
import { Users, Copy, Check, Bot, LogOut, Share2, Link as LinkIcon, QrCode, MessageCircle, Circle, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { ScoringMethod, UserProfile } from '@shared/schema';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { AIDifficulty } from '@shared/aiPlayer';
import SponsorBanner from './SponsorBanner';
import PendingInvites from './PendingInvites';
import Logo from './Logo';
import LandingScreen from './LandingScreen';
import PlayerAvatar from './PlayerAvatar';
import FriendsPanel from './FriendsPanel';
import { AdBannerTop, AdBannerBottom, AdSkyscraper } from './AdSlot';
import CreditBadge from './CreditBadge';
import ChipsBadge from './ChipsBadge';
import RewardedAdButton from './RewardedAdButton';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Player {
  id: string;
  name: string;
  isReady: boolean;
  isAI?: boolean;
  cardBackImage?: string;
  /** Real auth user.id (when this player is logged-in); null for AI / guest. */
  userId?: string | null;
}

interface GameLobbyProps {
  roomCode?: string;
  gameDbId?: string;
  players?: Player[];
  currentPlayerId?: string; // ID of the current logged-in player
  /** PlayerIds whose WS connection is currently dropped (server-derived). */
  disconnectedPlayerIds?: string[];
  initialJoinCode?: string; // Prefill the "join room" input from a deep link (?join=…)
  onCreateRoom?: (playerName: string, cardBackImage?: string, scoringMethod?: ScoringMethod, targetScore?: number, aiConfig?: {numAI: number, difficulty: AIDifficulty}, durationSec?: number) => void;
  onJoinRoom?: (roomCode: string, playerName: string, cardBackImage?: string) => void;
  onMatched?: (roomCode: string, playerId: string) => void;
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
  disconnectedPlayerIds = [],
  initialJoinCode,
  onCreateRoom,
  onJoinRoom,
  onMatched,
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
  const [joinCode, setJoinCode] = useState(initialJoinCode?.toUpperCase() ?? '');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const inviteByUsernameMutation = useMutation({
    mutationFn: async (input: { code: string; targetUsername: string }) => {
      const res = await apiRequest('POST', '/api/invite', input);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Invite sent', description: `Heads-up will appear on @${inviteUsername}'s home page.` });
      setInviteUsername('');
      qc.invalidateQueries({ queryKey: ['/api/invites'] });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't send invite", description: e.message, variant: 'destructive' });
    },
  });

  const inviteByEmailMutation = useMutation({
    mutationFn: async (input: { code: string; email: string }) => {
      const res = await apiRequest('POST', '/api/invite/email', input);
      return res.json() as Promise<{ delivered: boolean; invite: unknown | null }>;
    },
    onSuccess: (data) => {
      toast({
        title: 'Invite emailed',
        description: data.delivered
          ? `Sent to ${inviteEmail}.`
          : `Queued for ${inviteEmail}. (No mail provider configured — check the dev console for the link.)`,
      });
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['/api/invites'] });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't send invite", description: e.message, variant: 'destructive' });
    },
  });
  const inviteUrl = typeof window !== 'undefined' && roomCode
    ? `${window.location.origin}/?join=${encodeURIComponent(roomCode)}`
    : '';
  const canSystemShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
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

  const handleCopyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleSystemShare = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.share({
        title: 'Snatch&GrabIt!',
        text: `Join my Snatch&GrabIt! game — code ${roomCode}`,
        url: inviteUrl,
      });
    } catch {
      // User cancelled the share sheet or it's unsupported — silent.
    }
  };

  const handleWhatsAppShare = () => {
    if (!inviteUrl || !roomCode) return;
    const text = `🃏 Join my Snatch&GrabIt! game — room code ${roomCode}\n${inviteUrl}`;
    // wa.me works on both mobile (opens the app) and desktop (opens web WhatsApp).
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  // Card-back image upload constraints. Images are base64-encoded inline in the
  // create-room JSON body and rebroadcast in every WS room update, so we keep
  // the limit tight — 1MB is plenty for a card design and stays comfortably
  // below the 10MB server JSON-body cap even at 4/3× base64 overhead.
  const MAX_CARD_BACK_BYTES = 1 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const [uploadedFileLabel, setUploadedFileLabel] = useState<string>('');

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

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
        `Image is ${formatFileSize(file.size)} — please choose one under ${formatFileSize(MAX_CARD_BACK_BYTES)}. ` +
        'Try resizing it or saving at a lower quality.',
      );
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        setUploadError("Couldn't read that file as an image. Try a different one.");
        e.target.value = '';
        return;
      }
      setCardBackImage(result);
      setUploadedFileLabel(`${file.name} · ${formatFileSize(file.size)}`);
      setUploadError('');
    };
    reader.onerror = () => {
      setUploadError("Couldn't read the file. Try again or pick a different one.");
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleClearCardBack = () => {
    setCardBackImage('');
    setUploadedFileLabel('');
    setUploadError('');
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
    <div className="min-h-screen felt-bg flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <InstallAppButton />
        <RewardedAdButton />
        <ChipsBadge />
        <CreditBadge />
        <ThemeToggle />
        <AccountDropdown />
      </div>
      <AdBannerTop />
      {/* Desktop-only right rail (≥ lg). Absolute-positioned so it doesn't
          shift the centred main panel on smaller widths. */}
      <div className="hidden lg:block absolute right-4 top-24">
        <AdSkyscraper />
      </div>
      <div className="glass-strong rounded-2xl border border-gold/20 w-full max-w-2xl">
        <div className="p-6 pb-0 text-center">
          <div className="inline-flex items-center justify-center gap-3">
            <Logo size={40} className="text-gold" />
            <h1 className="text-4xl font-bold text-gradient-gold">
              Snatch&GrabIt!
            </h1>
          </div>
          <p className="text-gold-light/60 mt-2">
            Competitive Multiplayer Solitaire
            <span className="block text-xs mt-1 text-gold-light/40">Powered by AppSmith</span>
          </p>
        </div>
        <div className="p-6">
          {!inLobby ? (
            <LandingScreen
              initialJoinCode={initialJoinCode}
              isLoggedIn={!!user}
              profileDisplayName={profile?.displayName ?? undefined}
              profileCardBack={profile?.cardBackUrl ?? undefined}
              onCreateRoom={(name, cardBack, method, target, aiConfig, durationSec) =>
                onCreateRoom?.(name, cardBack, method, target, aiConfig, durationSec)
              }
              onJoinRoom={(code, name, cardBack) => onJoinRoom?.(code, name, cardBack)}
              onMatched={onMatched}
            />
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
                  title="Copy room code"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              {/* Invite-a-friend row */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyInviteLink}
                    data-testid="button-copy-invite-link"
                    className="glass border-gold/20 text-gold-light hover:border-gold/40 hover:bg-gold/10"
                  >
                    {linkCopied ? <Check className="w-4 h-4 mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                    {linkCopied ? 'Link copied!' : 'Copy invite link'}
                  </Button>
                  {canSystemShare && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSystemShare}
                      data-testid="button-system-share"
                      className="glass border-gold/20 text-gold-light hover:border-gold/40 hover:bg-gold/10"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share…
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleWhatsAppShare}
                    data-testid="button-whatsapp-share"
                    className="glass border-emerald-500/30 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/10"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowQr((v) => !v)}
                    data-testid="button-toggle-qr"
                    className="glass border-gold/20 text-gold-light hover:border-gold/40 hover:bg-gold/10"
                    aria-pressed={showQr}
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    {showQr ? 'Hide QR' : 'Show QR'}
                  </Button>
                </div>
                <p className="text-xs text-gold-light/40 break-all max-w-md text-center" data-testid="text-invite-url">
                  {inviteUrl}
                </p>
                {showQr && inviteUrl && (
                  <div
                    className="p-3 bg-white rounded-lg inline-block mx-auto"
                    data-testid="invite-qr-code"
                  >
                    <QRCodeSVG value={inviteUrl} size={160} level="M" includeMargin={false} />
                  </div>
                )}
              </div>

              {/* Invite by email — works for anyone (sends them a join link) */}
              {user && roomCode && (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs text-gold-light/50">Invite by email</div>
                  <form
                    className="flex gap-2 w-full max-w-md"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const email = inviteEmail.trim();
                      if (!email) return;
                      inviteByEmailMutation.mutate({ code: roomCode, email });
                    }}
                  >
                    <Input
                      type="email"
                      placeholder="friend@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      data-testid="input-invite-email"
                      className="flex-1"
                      autoComplete="email"
                      inputMode="email"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!inviteEmail.trim() || inviteByEmailMutation.isPending}
                      data-testid="button-invite-by-email"
                      className="btn-gold"
                    >
                      {inviteByEmailMutation.isPending ? 'Sending…' : 'Send'}
                    </Button>
                  </form>
                </div>
              )}

              {/* Invite a registered user by username */}
              {user && roomCode && (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-xs text-gold-light/50">Or invite a registered player by username</div>
                  <div className="flex gap-2 w-full max-w-md">
                    <Input
                      placeholder="Username"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      data-testid="input-invite-username"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        inviteByUsernameMutation.mutate({ code: roomCode, targetUsername: inviteUsername.trim() })
                      }
                      disabled={!inviteUsername.trim() || inviteByUsernameMutation.isPending}
                      data-testid="button-invite-by-username"
                      className="btn-gold"
                    >
                      Invite
                    </Button>
                  </div>
                </div>
              )}

              {/* Friends — quick-challenge any online accepted friend with one tap */}
              {user && roomCode && (
                <div className="space-y-2">
                  <div className="text-xs text-gold-light/50 text-center">Challenge a friend</div>
                  <FriendsPanel
                    hideAdd
                    limit={5}
                    onChallenge={(f) =>
                      inviteByUsernameMutation.mutate({ code: roomCode, targetUsername: f.username })
                    }
                  />
                </div>
              )}

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
                  {players.map((player) => {
                    const isOffline = !player.isAI && disconnectedPlayerIds.includes(player.id);
                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 glass rounded-md border border-gold/10"
                        data-testid={`player-slot-${player.id}`}
                      >
                        <span className="text-sm font-medium text-gold-light flex items-center gap-2">
                          <PlayerAvatar id={player.id} name={player.name} size={24} />
                          {player.name}
                          {isOffline && (
                            <span
                              className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                              title="Lost connection — may have closed the tab or dropped Wi-Fi."
                              data-testid={`player-disconnected-${player.id}`}
                            >
                              ● Offline
                            </span>
                          )}
                        </span>
                        {player.isReady && (
                          <Badge variant="default" className="text-xs badge-gold">
                            Ready
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Betting Panel - Only show when there are 2+ players and user is logged in */}
              {players.length >= 2 && user && currentPlayerId && (
                <BettingPanel
                  players={players}
                  currentPlayerId={currentPlayerId}
                  gameId={gameDbId}
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
                {(() => {
                  const me = players.find((p) => p.id === currentPlayerId);
                  const isReady = !!me?.isReady;
                  // State-style label (clearer for first-time players than the
                  // toggle-action pattern): the button shows what state you're
                  // CURRENTLY in, tapping it flips that state.
                  return (
                    <Button
                      variant={isReady ? 'default' : 'outline'}
                      className={
                        isReady
                          ? 'flex-1 bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-600 font-semibold'
                          : 'flex-1 glass border-gold/30 text-gold-light hover:border-gold/50 hover:bg-gold/10'
                      }
                      onClick={onToggleReady}
                      data-testid="button-toggle-ready"
                    >
                      {isReady ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Ready
                        </>
                      ) : (
                        <>
                          <Circle className="w-4 h-4 mr-2" />
                          Tap when ready
                        </>
                      )}
                    </Button>
                  );
                })()}
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
      <AdBannerBottom />
      {/* Footer — links to legal pages so AdSense reviewers (and curious
          users) can find them within one click of the landing. */}
      <footer className="mt-4 mb-2 text-xs text-gold-light/40 flex flex-wrap items-center justify-center gap-2">
        <span>&copy; Snatch&amp;GrabIt!</span>
        <span>·</span>
        <a href="/privacy" className="hover:text-gold-light/80 underline-offset-2 hover:underline">Privacy</a>
        <span>·</span>
        <a href="/terms" className="hover:text-gold-light/80 underline-offset-2 hover:underline">Terms</a>
        <span>·</span>
        <a href="/print" className="hover:text-gold-light/80 underline-offset-2 hover:underline">Order a physical deck</a>
      </footer>
    </div>
  );
}
