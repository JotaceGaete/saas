import React from 'react';
import PublicPageLayout from 'components/PublicPageLayout';
import Icon from 'components/AppIcon';
import { SUPPORT_EMAIL, SUPPORT_HOURS_DAYS, SUPPORT_HOURS_RANGE } from 'config/support';

const SECTION_CLASS = 'mb-8';
const H2_CLASS = 'text-lg font-semibold mb-3';
const P_CLASS = 'text-sm mb-2';
const style = {
  fontCaption: { fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' },
  fontHeading: { fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' },
};

export default function SupportPage() {
  return (
    <PublicPageLayout title="Centro de Soporte">
      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>Canal oficial de soporte</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          El soporte oficial de Walinka se presta exclusivamente por correo electrónico. No ofrecemos soporte por WhatsApp, teléfono, redes sociales ni otros canales, salvo comunicación escrita de Walinka.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff', fontFamily: 'var(--font-caption)' }}
        >
          <Icon name="Mail" size={16} color="#ffffff" />
          {SUPPORT_EMAIL}
        </a>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>Horario de atención</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          {SUPPORT_HOURS_DAYS}, de {SUPPORT_HOURS_RANGE}.
        </p>
        <p className={P_CLASS} style={style.fontCaption}>
          Las consultas recibidas fuera de este horario serán respondidas a partir del siguiente día hábil.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>Tiempos de respuesta</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          El tiempo de respuesta y resolución depende de la complejidad de cada incidencia. Realizamos esfuerzos razonables para atender las solicitudes oportunamente, sin garantizar un tiempo específico de respuesta o resolución.
        </p>
      </section>
    </PublicPageLayout>
  );
}
