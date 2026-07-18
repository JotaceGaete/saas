/**
 * Adjunta un código de diagnóstico corto (prefijo del eventId de Sentry) a un
 * mensaje de error visible, para que el usuario pueda reportarlo y quede
 * cruzado con el evento correspondiente en Sentry.
 */
export function withDiagnostic(message, error) {
  if (!error?.sentryEventId) return message;
  return `${message} (ref: ${error.sentryEventId.slice(0, 8)})`;
}
