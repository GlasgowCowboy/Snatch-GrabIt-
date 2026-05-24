import { Flame, Check, X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { BurnProposal, GameState } from '@shared/schema';

interface BurnVoteModalProps {
  proposal: BurnProposal;
  state: GameState;
  currentPlayerId: string;
  onVote: (vote: 'yes' | 'no') => void;
}

export default function BurnVoteModal({ proposal, state, currentPlayerId, onVote }: BurnVoteModalProps) {
  const proposer = state.players.find((p) => p.id === proposal.proposerId);
  const myVote = proposal.votes[currentPlayerId];
  const isProposer = proposal.proposerId === currentPlayerId;
  const eligibleToVote = currentPlayerId in proposal.votes;
  const pendingVoters = Object.entries(proposal.votes)
    .filter(([, v]) => v === 'pending')
    .map(([pid]) => state.players.find((p) => p.id === pid)?.name ?? 'someone');

  const topBone = proposer?.bonePile[proposer.bonePile.length - 1];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      data-testid="burn-vote-modal"
    >
      <div className="glass-strong border border-orange-500/40 rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-500/20 border border-orange-500/40">
            <Flame className="w-7 h-7 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold text-gradient-gold">Burn vote</h2>
          <p className="text-sm text-gold-light/70">
            <span className="font-semibold text-gold-light">{proposer?.name ?? 'A player'}</span>
            {' '}wants to burn their top bone-pile card to escape a stuck position.
          </p>
          {topBone && (
            <p className="text-xs text-gold-light/50">
              Burning costs −2 pts in Full Hand scoring (same as leaving it unplayed).
            </p>
          )}
        </div>

        {/* Vote tally */}
        <div className="space-y-2" data-testid="burn-vote-tally">
          {state.players.map((p) => {
            const v = proposal.votes[p.id];
            if (v === undefined) return null;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 glass rounded-md border border-gold/10 text-sm"
                data-testid={`burn-vote-row-${p.id}`}
              >
                <span className="text-gold-light flex items-center gap-2">
                  {p.name}
                  {p.id === proposal.proposerId && (
                    <Badge variant="outline" className="text-xs">proposer</Badge>
                  )}
                  {p.isAI && <Badge variant="outline" className="text-xs">AI</Badge>}
                </span>
                {v === 'yes' && (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                    <Check className="w-3 h-3" /> Yes
                  </span>
                )}
                {v === 'no' && (
                  <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                    <X className="w-3 h-3" /> No
                  </span>
                )}
                {v === 'pending' && (
                  <span className="flex items-center gap-1 text-gold-light/50 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" /> Waiting
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Action area */}
        <div className="flex justify-center gap-3 pt-2">
          {isProposer ? (
            <p className="text-sm text-gold-light/60 italic">
              Waiting on {pendingVoters.length > 0 ? pendingVoters.join(', ') : 'the table'}…
            </p>
          ) : eligibleToVote && myVote === 'pending' ? (
            <>
              <Button
                variant="outline"
                className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                onClick={() => onVote('no')}
                data-testid="button-burn-vote-no"
              >
                <X className="w-4 h-4 mr-2" />
                Deny
              </Button>
              <Button
                className="btn-gold"
                onClick={() => onVote('yes')}
                data-testid="button-burn-vote-yes"
              >
                <Check className="w-4 h-4 mr-2" />
                Allow
              </Button>
            </>
          ) : (
            <p className="text-sm text-gold-light/60 italic">
              {eligibleToVote ? 'Waiting on the rest of the table…' : 'Not eligible to vote'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
