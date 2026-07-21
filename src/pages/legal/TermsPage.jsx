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
    <PublicPageLayout title="Términos y Condiciones">
      <p className="text-sm mb-6" style={style.fontCaption}>
        <strong>Fecha de vigencia:</strong> [EFFECTIVE_DATE]
      </p>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>1. Descripción del Servicio</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          [COMPANY_NAME] (“nosotros”, “nuestro” o “nos”) opera una plataforma de software como servicio en [DOMAIN] que permite a pequeños negocios crear catálogos de productos en línea, exhibir productos, recibir y gestionar pedidos, administrar clientes y pedidos, y compartir catálogos por WhatsApp y redes sociales. Al utilizar nuestro servicio, aceptas estos Términos y Condiciones.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>2. Tus Responsabilidades</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Eres responsable de la exactitud de la información que proporciones, de mantener seguras las credenciales de tu cuenta, y de toda actividad realizada bajo tu cuenta. Debes usar el servicio conforme a la legislación aplicable y no debes utilizarlo para vender bienes ilegales o para acosar o dañar a terceros.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>3. Uso Aceptable</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          No puedes utilizar el servicio para distribuir malware, spam o contenido ilegal; para suplantar a terceros; para eludir medidas de seguridad o límites de uso; ni para revender o sublicenciar el servicio de una manera que compita con nosotros sin nuestro consentimiento por escrito. Podemos suspender o cancelar cuentas que infrinjan estas reglas.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>4. Pagos y Suscripciones</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Los planes pagados se facturan de acuerdo con los precios publicados en nuestra página de Planes. Nos autorizas a nosotros (o a nuestro procesador de pagos) a cobrar el medio de pago que proporciones. Las tarifas se cobran generalmente por adelantado por el período de facturación correspondiente. Si el pago falla, podemos suspender el acceso hasta que el saldo sea regularizado.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>5. Cancelaciones</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Puedes cancelar una suscripción pagada en cualquier momento desde la configuración de tu cuenta. La cancelación tendrá efecto al final del período de facturación vigente. Podemos cancelar o suspender tu cuenta por incumplimiento de estos Términos o por razones operativas o legales, con aviso previo cuando sea posible.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>6. Reembolsos</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Nuestra política de reembolsos se encuentra en nuestra <Link to="/refunds" className="underline" style={{ color: 'var(--color-primary)' }}>Política de Reembolsos</Link> separada. Por favor revísala para conocer las condiciones y el proceso para solicitar un reembolso.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>7. Limitación de Responsabilidad</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          En la máxima medida permitida por la ley, [COMPANY_NAME] y sus afiliados no serán responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos, ni por pérdida de ganancias, datos o negocio. Nuestra responsabilidad total por cualquier reclamo derivado de o relacionado con el servicio no excederá el monto que hayas pagado en los doce (12) meses anteriores al reclamo.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>8. Ley Aplicable y Jurisdicción</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Estos Términos se rigen por las leyes de [JURISDICTION]. Cualquier disputa será resuelta en los tribunales de [JURISDICTION].
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>9. Soporte Técnico y Atención al Cliente</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Walinka proporciona soporte técnico exclusivamente a través de correo electrónico, utilizando los canales oficiales informados por la plataforma.
        </p>
        <p className={P_CLASS} style={style.fontCaption}>
          El horario oficial de atención es de lunes a viernes, de 13:00 a 22:00 (GMT).
        </p>
        <p className={P_CLASS} style={style.fontCaption}>
          Las consultas recibidas fuera de este horario, así como durante fines de semana o días festivos, serán atendidas a partir del siguiente día hábil, respetando el orden de recepción.
        </p>
        <p className={P_CLASS} style={style.fontCaption}>
          Walinka no ofrece soporte telefónico, por WhatsApp, redes sociales ni otros canales distintos al correo electrónico, salvo que lo comunique expresamente por escrito.
        </p>
        <p className={P_CLASS} style={style.fontCaption}>
          En caso de incidencias técnicas, el tiempo de respuesta y de resolución podrá variar según la complejidad de cada caso. Walinka realizará esfuerzos razonables para responder y resolver las solicitudes en el menor tiempo posible, sin que ello constituya una garantía de respuesta o resolución dentro de un plazo determinado.
        </p>
        <p className={P_CLASS} style={style.fontCaption}>
          Walinka podrá responder consultas fuera del horario indicado cuando las circunstancias lo permitan; sin embargo, ello será de carácter excepcional y no modificará el horario oficial de atención establecido en estos Términos y Condiciones.
        </p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={H2_CLASS} style={style.fontHeading}>10. Contacto</h2>
        <p className={P_CLASS} style={style.fontCaption}>
          Para consultas sobre estos Términos, contáctanos en: [SUPPORT_EMAIL]
        </p>
      </section>
    </PublicPageLayout>
  );
}
