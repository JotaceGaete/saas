import React from 'react';
import { motion } from 'framer-motion';

const DURATION = 0.22;

/**
 * Wraps route content for a short fade/slide transition (200–250ms).
 * Use with AnimatePresence and key={location.pathname} on the parent.
 */
export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION, ease: [0.4, 0, 0.2, 1] }}
      style={{ minHeight: 'inherit' }}
    >
      {children}
    </motion.div>
  );
}
