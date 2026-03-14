import React from 'react';
import PublicPageLayout from 'components/PublicPageLayout';

const SECTION_CLASS = 'mb-8';
const H2_CLASS = 'text-lg font-semibold mb-3';
const P_CLASS = 'text-sm mb-2';
const style = {
  fontCaption: { fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' },
  fontHeading: { fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' },
};

export default function PrivacyPage() {
  return (
    <PublicPageLayout title="Privacy Policy">
      <p className="text-sm mb-6" style={style.fontCaption}>
        <strong>Effective date:</strong> [EFFECTIVE_DATE]
      </p>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>1. Who We Are</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          [COMPANY_NAME] operates the service at [DOMAIN], which provides online catalogs and order management for small businesses. This policy describes how we collect, use, and protect your information.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>2. Information We Collect</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          We collect information you provide when you register (e.g. email, business name, contact details), content you add (product information, catalog settings), and usage data (e.g. how you use the dashboard, orders received). When you or your customers visit a public catalog, we may collect basic access data (e.g. IP, device type) for security and analytics.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>3. How We Use Your Information</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          We use your information to provide, operate, and improve the service; to process payments; to send transactional and product-related communications; to enforce our terms and prevent abuse; and to comply with law. We do not sell your personal information to third parties for marketing.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>4. Data Sharing</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          We may share data with service providers that help us run the platform (e.g. hosting, payment processing, email). Those providers are bound by confidentiality and data-processing agreements. We may also disclose data when required by law or to protect our rights and safety.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>5. Cookies and Similar Technologies</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          We use cookies and similar technologies to keep you logged in, to remember your preferences, and to understand how the site is used. You can control cookies through your browser settings. Some features may not work correctly if you disable essential cookies.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>6. Data Retention and Security</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          We retain your data for as long as your account is active and as needed to provide the service and comply with legal obligations. We implement appropriate technical and organizational measures to protect your data against unauthorized access, loss, or misuse.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>7. Your Rights</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Depending on your location, you may have the right to access, correct, delete, or port your personal data, or to object to or restrict certain processing. To exercise these rights, contact us at [SUPPORT_EMAIL]. You may also have the right to lodge a complaint with a supervisory authority.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>8. Contact</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          For privacy-related questions or requests: [SUPPORT_EMAIL]
        </p>
      </section>
    </PublicPageLayout>
  );
}
