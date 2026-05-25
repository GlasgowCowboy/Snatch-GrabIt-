import { Sun, Moon } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from '@/hooks/use-theme';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="button-theme-toggle"
      className="glass border-gold/20 text-gold-light hover:border-gold/40 hover:bg-gold/10 h-9 w-9"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}
