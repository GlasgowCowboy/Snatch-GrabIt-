import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GameCountdownProps {
  show: boolean;
  onComplete: () => void;
}

export default function GameCountdown({ show, onComplete }: GameCountdownProps) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (!show) {
      setCount(3);
      return;
    }

    // Start the countdown sequence
    const timers: NodeJS.Timeout[] = [];
    
    // 3 (Ready) -> wait 1s
    timers.push(setTimeout(() => setCount(2), 1000));
    // 2 (Set) -> wait 1s
    timers.push(setTimeout(() => setCount(1), 2000));
    // 1 (Go!) -> wait 1s
    timers.push(setTimeout(() => setCount(0), 3000));
    // 0 (GO!) -> wait 1s then complete
    timers.push(setTimeout(() => onComplete(), 4000));

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [show, onComplete]);

  const getText = () => {
    if (count === 3) return { main: 'Call', sub: 'Ready' };
    if (count === 2) return { main: 'Uncle', sub: 'Set' };
    if (count === 1) return { main: 'Joe', sub: 'Go!' };
    return { main: '', sub: '' };
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(225,30%,6%)/0.97] backdrop-blur-md"
          style={{ background: 'radial-gradient(ellipse at center, hsl(45 80% 50% / 0.08) 0%, hsl(225 30% 6% / 0.97) 60%)' }}
        >
          <motion.div
            key={count}
            initial={{ scale: 0.3, opacity: 0, filter: 'blur(10px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            exit={{ scale: 2, opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center"
          >
            <h1
              className="text-8xl md:text-9xl font-bold text-gradient-gold"
              style={{ textShadow: '0 0 40px hsl(45 100% 55% / 0.4), 0 0 80px hsl(45 100% 55% / 0.2)' }}
              data-testid="text-countdown-main"
            >
              {getText().main}
            </h1>
            {count > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="text-5xl md:text-6xl font-bold text-gold-light/50 mt-4"
                style={{ textShadow: '0 0 20px hsl(45 100% 55% / 0.15)' }}
                data-testid="text-countdown-sub"
              >
                {getText().sub}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
