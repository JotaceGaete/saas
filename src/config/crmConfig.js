/**
 * CRM_EARLY_ACCESS_MODE = true  → plan gating disabled; admins have full CRM access,
 *                                  normal users are already blocked by sidebar adminOnly.
 * CRM_EARLY_ACCESS_MODE = false → re-enables plan checks (requires 'business' plan).
 */
export const CRM_EARLY_ACCESS_MODE = false;
