export const TRIAL_DURATION_DAYS = 14;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getTrialEndDateFrom(startDate = new Date()) {
  const base = startDate instanceof Date ? startDate : new Date(startDate);
  return new Date(base.getTime() + TRIAL_DURATION_DAYS * DAY_IN_MS);
}

export function getTrialDaysLeft(trialExpiresAt, nowDate = new Date()) {
  if (!trialExpiresAt) return 0;
  const end = new Date(trialExpiresAt);
  if (Number.isNaN(end.getTime())) return 0;
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_IN_MS);
}
