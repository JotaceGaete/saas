import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

Sentry.init({
  dsn,

  enabled: import.meta.env.PROD && Boolean(dsn),

  environment: import.meta.env.MODE,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // No consume grabaciones en sesiones normales.
  replaysSessionSampleRate: 0,

  // Graba la sesión cuando ocurre un error.
  replaysOnErrorSampleRate: 1,
});