import React from 'react';
import PublicPageLayout from 'components/PublicPageLayout';

const SECTION_CLASS = 'mb-8';
const H2_CLASS = 'text-lg font-semibold mb-3';
const P_CLASS = 'text-sm mb-2';
const style = {
  fontCaption: { fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' },
  fontHeading: { fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' },
};

export default function RefundsPage() {
  return (
    <PublicPageLayout title="Refund Policy">
      <p className="text-sm mb-6" style={style.fontCaption}>
        <strong>Effective date:</strong> [EFFECTIVE_DATE]
      </p>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>1. General</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          [COMPANY_NAME] offers paid subscription plans for its service at [DOMAIN]. This Refund Policy explains when and how you may request a refund for payments made to us.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>2. Eligibility for Refunds</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          You may request a refund within [REFUND_DAYS] days of the charge if you have not substantially used the paid features (e.g. no significant order volume or catalog changes under the paid plan). Refund requests are evaluated on a case-by-case basis. We may refuse refunds if we detect abuse, violation of our Terms, or if the subscription period has already been largely used.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>3. How to Request a Refund</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Send a clear refund request to [SUPPORT_EMAIL] with the email address associated with your account and the approximate date and amount of the charge. We will respond within a reasonable time and, if the refund is approved, process it to the original payment method. Refunds may take several business days to appear depending on your bank or card issuer.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>4. Cancellation vs. Refund</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Cancelling your subscription stops future charges but does not automatically entitle you to a refund for the current period. If you cancel and believe you are eligible for a refund under this policy, you must submit a refund request as described above.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>5. Contact</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          For refund requests or questions about this policy: [SUPPORT_EMAIL]
        </p>
      </section>
    </PublicPageLayout>
  );
}
