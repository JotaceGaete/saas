import React, { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';

/**
 * TEMPORARY debug route — /debug/sentry
 *
 * Verifies the production Sentry integration by capturing a test
 * exception and displaying the resulting eventId on screen.
 *
 * Delete this file and its route in src/Routes.jsx once verified.
 */
const DebugSentry = () => {
  const [eventId, setEventId] = useState(null);
  const [status, setStatus] = useState('sending');

  useEffect(() => {
    const id = Sentry.captureException(new Error('Sentry production test'));

    Sentry.flush(2000).finally(() => {
      setEventId(id);
      setStatus('sent');
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
      <h1 className="text-2xl font-medium text-onBackground mb-2">
        Sentry debug route (TEMPORARY)
      </h1>
      <p className="text-onBackground/70 mb-4">
        {status === 'sending' ? 'Sending test event to Sentry…' : 'Test event sent.'}
      </p>
      <p className="font-mono text-sm text-onBackground/90">
        eventId: {eventId || '—'}
      </p>
    </div>
  );
};

export default DebugSentry;
