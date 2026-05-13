import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { SonatrachLogo } from './SonatrachLogo';

export function LoadingScreen({ ready, onComplete }: { ready: boolean; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  // Fill to 80% quickly on mount, hold until auth ready
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 80) { clearInterval(interval); return 80; }
        return prev + 4;
      });
    }, 20);
    return () => clearInterval(interval);
  }, []);

  // When auth resolves, jump to 100% and complete
  useEffect(() => {
    if (!ready) return;
    setProgress(100);
    const t = setTimeout(onComplete, 400);
    return () => clearTimeout(t);
  }, [ready, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-white flex flex-col items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <SonatrachLogo size="large" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-16 w-64"
      >
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF8C3D]"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <p className="text-center mt-4 text-sm text-gray-500" style={{ fontFamily: 'var(--font-body)' }}>
          LeaveRec System
        </p>
      </motion.div>

      {/* Geometric decoration */}
      <motion.div
        className="absolute top-10 right-10 w-32 h-32 border-4 border-[#FF6B00] opacity-10"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute bottom-10 left-10 w-24 h-24 bg-[#FF6B00] opacity-5"
        animate={{ rotate: -360 }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}
