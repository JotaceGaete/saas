import React from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageTransition from 'components/PageTransition';

/**
 * Wraps outlet content for 200–250ms page transitions on route change.
 * Does not change routing; only adds animation.
 */
export default function AnimatedLayout() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname}>
        <Outlet />
      </PageTransition>
    </AnimatePresence>
  );
}
