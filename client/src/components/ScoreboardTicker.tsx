import { PlayerState, ScoringMethod } from '@shared/schema';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';

interface ScoreboardTickerProps {
  players: PlayerState[];
  scoringMethod: ScoringMethod;
}

export default function ScoreboardTicker({ players, scoringMethod }: ScoreboardTickerProps) {
  // Remove duplicate players and sort
  const uniquePlayers = Array.from(new Map(players.map(p => [p.id, p])).values());
  const sortedPlayers = [...uniquePlayers].sort((a, b) => b.score - a.score);
  
  const scoreText = sortedPlayers
    .map((player, index) => `#${index + 1} ${player.name}: ${player.score} ${scoringMethod === 'fullHand' ? 'pts' : 'rounds'}`)
    .join(' • ');

  return (
    <div className="w-full glass border-y border-gold/20 relative" data-testid="scoreboard-ticker">
      <Accordion type="single" collapsible>
        <AccordionItem value="scoreboard" className="border-0">
          <AccordionTrigger className="py-2 px-4 hover:no-underline" data-testid="trigger-scoreboard">
            <div className="flex items-center gap-2 w-full">
              <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
              <span className="text-sm font-semibold flex-shrink-0 text-gold-light">Scoreboard</span>
              <div className="flex-1 overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-gold/10 to-transparent z-10 pointer-events-none" />
                <div className="animate-scroll-left whitespace-nowrap">
                  <span className="text-sm font-semibold text-gold/80">
                    {scoreText} • {scoreText}
                  </span>
                </div>
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-gold/10 to-transparent z-10 pointer-events-none" />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4 px-4" data-testid="accordion-scoreboard">
            <div className="space-y-2">
              {sortedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg glass border border-gold/15"
                  data-testid={`scoreboard-player-${player.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={index === 0 ? 'default' : 'outline'} className={index === 0 ? 'badge-gold' : 'border-gold/30 text-gold-light'}>
                      #{index + 1}
                    </Badge>
                    <span className="font-semibold text-gold-light">{player.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-gold" data-testid={`score-${player.id}`}>
                      {player.score}
                    </div>
                    <div className="text-xs text-gold-light/50">
                      {scoringMethod === 'fullHand' ? 'points' : 'rounds'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
