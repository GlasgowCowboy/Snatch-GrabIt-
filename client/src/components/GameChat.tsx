import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@shared/schema';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface GameChatProps {
  messages: ChatMessage[];
  currentPlayerId: string;
  currentPlayerName: string;
  onSendMessage: (message: string) => void;
}

const PROFANITY_LIST = [
  'fuck', 'fucking', 'fucked', 'fucker', 'fucks',
  'shit', 'shitting', 'shitty', 'shits',
  'damn', 'damned', 'dammit',
  'ass', 'asses', 'asshole', 'assholes',
  'bitch', 'bitches', 'bitching',
  'bastard', 'bastards',
  'crap', 'crappy', 'craps',
  'piss', 'pissed', 'pissing',
  'dick', 'dicks',
  'cock', 'cocks',
  'pussy', 'pussies',
  'cunt', 'cunts',
  'whore', 'whores',
  'slut', 'sluts', 'slutty',
  'fag', 'fags', 'faggot', 'faggots',
  'nigger', 'niggers', 'nigga', 'niggas',
  'retard', 'retarded', 'retards',
  'hell', 'bloody'
];

function filterProfanity(text: string): string {
  let filtered = text;
  PROFANITY_LIST.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });
  return filtered;
}

export default function GameChat({
  messages,
  currentPlayerId,
  currentPlayerName,
  onSendMessage,
}: GameChatProps) {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll the Radix ScrollArea viewport directly — not scrollIntoView, which
    // walks ancestors and yanks the whole page if the chat container is partly
    // off-screen. Depend on length, not the messages array: the parent recreates
    // `[]` on every render when chatMessages is undefined, which would fire the
    // effect (and scroll the page) on every AI-driven WS broadcast.
    const el = messagesEndRef.current;
    if (!el) return;
    const viewport = el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = inputMessage.trim();
    if (!trimmed) return;

    const filtered = filterProfanity(trimmed);
    onSendMessage(filtered);
    setInputMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const QUICK_REACTIONS = ['👍', '🔥', '😂', '😱', '🎉', '💀'] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-2 pb-2 border-b">
        <Input
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className="flex-1"
          data-testid="input-chat-message"
        />
        <Button
          onClick={handleSend}
          size="icon"
          disabled={!inputMessage.trim()}
          data-testid="button-send-message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Quick-reaction strip — one-tap emoji sends. Doesn't fight typed
          messages, just gives players a fast "👍 nice move" affordance
          without opening their phone keyboard. */}
      <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSendMessage(emoji)}
            className="h-9 w-9 text-lg rounded-md hover:bg-gold/10 active:scale-95 transition-transform"
            title={`Send ${emoji}`}
            data-testid={`button-emoji-${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 pr-4" data-testid="chat-messages-area">
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-4">
              No messages yet. Start chatting!
            </div>
          ) : (
            messages.map((msg) => {
              const isCurrentPlayer = msg.playerId === currentPlayerId;
              const time = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${isCurrentPlayer ? 'items-end' : 'items-start'}`}
                  data-testid={`chat-message-${msg.id}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold">{msg.playerName}</span>
                    <span>{time}</span>
                  </div>
                  <div
                    className={`rounded-lg px-3 py-2 max-w-[80%] ${
                      isCurrentPlayer
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm break-words">{msg.message}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
