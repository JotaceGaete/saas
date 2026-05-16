export const EMAIL_AUTOMATION_DISABLED_REASON = 'EMAIL_AUTOMATION_DISABLED'

export function isEmailAutomationEnabled(env = {}) {
  return env.EMAIL_AUTOMATION_ENABLED === 'true'
}

export function emailAutomationDisabledPayload() {
  return {
    skipped: true,
    reason: EMAIL_AUTOMATION_DISABLED_REASON,
  }
}
