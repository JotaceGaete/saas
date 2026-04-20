export const ONBOARDING_STEPS = ['business_basics', 'first_product', 'preview', 'completed'];

export function isKnownOnboardingStep(value) {
  return ONBOARDING_STEPS.includes(value);
}

export function isOnboardingComplete(business) {
  if (!business?.id) return false;
  return business?.onboardingStep === 'completed' || Boolean(business?.onboardingCompletedAt);
}

export function getOnboardingResumeStep(business, products = []) {
  if (!business?.id) return 'business_basics';
  if (isOnboardingComplete(business)) return 'completed';

  const storedStep = isKnownOnboardingStep(business?.onboardingStep)
    ? business.onboardingStep
    : 'business_basics';

  if (storedStep === 'business_basics') return 'business_basics';

  const productCount = Array.isArray(products)
    ? products.length
    : Number(products) || 0;

  if (productCount > 0) return 'preview';
  return 'first_product';
}

export function resolvePostAuthRoute({ user, business }) {
  if (!user) return '/business-registration';
  if (!business?.id) return '/onboarding';
  if (!isOnboardingComplete(business)) return '/onboarding';
  return '/dashboard';
}
