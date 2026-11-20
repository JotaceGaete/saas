import {
  ARTEMIS_HOME_TEMPLATE_KEY,
  ARTEMIS_HOME_SECTIONS,
  buildEditorInitialDraft,
  validateArtemisHomeContent,
} from './artemisHome';

// Registro de plantillas editables. Para una plantilla nueva, se agrega una entrada aquí
// con su contrato, sus campos y su validación. El editor no cambia.
export const WEBSITE_TEMPLATES = {
  [ARTEMIS_HOME_TEMPLATE_KEY]: {
    key: ARTEMIS_HOME_TEMPLATE_KEY,
    title: 'Portada Artemis',
    sections: ARTEMIS_HOME_SECTIONS,
    buildInitialDraft: buildEditorInitialDraft,
    validate: validateArtemisHomeContent,
  },
};

// Comercios habilitados para el editor en esta fase (piloto). Los administradores de Walinka
// pueden entrar en cualquier comercio.
export const WEBSITE_EDITOR_PILOT_SLUGS = ['artemis-chile'];

export function canUseWebsiteEditor({ business, isAdmin }) {
  if (!business?.slug) return false;
  return Boolean(isAdmin) || WEBSITE_EDITOR_PILOT_SLUGS.includes(business.slug);
}
