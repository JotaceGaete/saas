// Pura lógica de decisión para ofrecer restaurar un borrador local — sin React ni DOM.
// La oferta debe ser un chequeo de una sola vez, hecho apenas termina de cargar la
// pantalla y ANTES de que el usuario empiece a interactuar con el formulario. Si para
// cuando el borrador se detecta el usuario ya escribió algo (o está enfocado en un campo
// a punto de escribir), la oferta se salta silenciosamente — nunca interrumpe.

/**
 * @param {object} params
 * @param {boolean} params.hasDraft — hay un borrador guardado para este formulario/registro
 * @param {boolean} params.isDirty — el formulario ya difiere de su estado inicial (el
 *   usuario ya escribió algo en esta sesión, sea por el borrador o por su propia edición)
 * @param {boolean} params.isLoading — la pantalla todavía está cargando datos del registro
 * @param {boolean} params.isFieldFocused — hay un input/textarea/contenteditable enfocado
 *   en este momento (el usuario está a punto de escribir, aunque el valor no haya
 *   cambiado todavía)
 * @returns {boolean} true si corresponde mostrar el diálogo de "encontramos un borrador"
 */
export function shouldOfferDraftRestore({ hasDraft, isDirty, isLoading, isFieldFocused }) {
  if (isLoading) return false;
  if (!hasDraft) return false;
  if (isDirty) return false;
  if (isFieldFocused) return false;
  return true;
}

/**
 * Una vez mostrado el diálogo, si el usuario de todas formas llega a modificar el
 * formulario (por ejemplo por un cambio de estado ajeno mientras el diálogo está abierto)
 * la oferta se retira sola, sin bloquear la pantalla — nunca se fuerza una respuesta.
 *
 * @param {object} params
 * @param {boolean} params.isPromptOpen
 * @param {boolean} params.isDirty
 * @returns {boolean} true si el diálogo debe cerrarse automáticamente
 */
export function shouldWithdrawDraftPrompt({ isPromptOpen, isDirty }) {
  return isPromptOpen && isDirty;
}
