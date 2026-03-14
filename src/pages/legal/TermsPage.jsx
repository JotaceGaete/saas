import React from 'react';
import { Link } from 'react-router-dom';
import PublicPageLayout from 'components/PublicPageLayout';

const SECTION_CLASS = 'mb-8';
const H2_CLASS = 'text-lg font-semibold mb-3';
const P_CLASS = 'text-sm mb-2';
const style = {
  fontCaption: { fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' },
  fontHeading: { fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' },
};

export default function TermsPage() {
  return (
    <PublicPageLayout title="Terms of Service">
      <p className="text-sm mb-6" style={style.fontCaption}>
        <strong>Effective date:</strong> [EFFECTIVE_DATE]
      </p>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>1. Description of the Service</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          [COMPANY_NAME] (“we”, “our”, or “us”) operates a software-as-a-service platform at [DOMAIN] that allows small businesses to create online product catalogs, display products, receive and manage orders, manage customers and orders, and share catalogs via WhatsApp and social media. By using our service, you agree to these Terms of Service.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>2. Your Responsibilities</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          You are responsible for the accuracy of the information you provide, for keeping your account credentials secure, and for all activity under your account. You must use the service in compliance with applicable laws and must not use it to sell illegal goods or to harass or harm others.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>3. Acceptable Use</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          You may not use the service to distribute malware, spam, or illegal content; to impersonate others; to circumvent security or usage limits; or to resell or sublicense the service in a manner that competes with us without our written consent. We may suspend or terminate accounts that violate these rules.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>4. Payments and Subscriptions</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Paid plans are billed according to the pricing published on our Plans page. You authorize us (or our payment processor) to charge the payment method you provide. Fees are generally charged in advance for the billing period. If payment fails, we may suspend access until the balance is paid.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>5. Cancellations</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          You may cancel a paid subscription at any time from your account settings. Cancellation will take effect at the end of the current billing period. We may cancel or suspend your account for breach of these Terms or for operational or legal reasons, with notice where feasible.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>6. Refunds</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Our refund policy is set out in our separate <Link to="/refunds" className="underline" style={{ color: 'var(--color-primary)' }}>Refund Policy</Link>. Please review it for conditions and process for requesting a refund.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>7. Limitation of Liability</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          To the maximum extent permitted by law, [COMPANY_NAME] and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or business. Our total liability for any claim arising from or related to the service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>8. Governing Law and Jurisdiction</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          These Terms are governed by the laws of [JURISDICTION]. Any dispute shall be resolved in the courts of [JURISDICTION].
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>9. Contact</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          For questions about these Terms, contact us at: [SUPPORT_EMAIL]
        </p>
      </section>
    </PublicPageLayout>
  );
}
