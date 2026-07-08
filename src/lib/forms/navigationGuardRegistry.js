// Registro liviano (singleton en memoria) para que CUALQUIER punto de navegación de la
// app (ej. el sidebar global) pueda respetar el formulario que useUnsavedChangesGuard
// está protegiendo en ese momento, sin que ese punto de navegación tenga que conocer o
// importar el formulario específico.
//
// En la práctica suele haber como mucho un guard activo a la vez (un solo formulario
// protegido montado por pantalla), pero se modela como pila para que guards anidados o
// secuenciales no se pisen entre sí.

const guardStack = [];

// Llamado por useUnsavedChangesGuard mientras `isDirty` es true. Devuelve una función
// para des-registrarse (cleanup del efecto / cuando isDirty pasa a false).
export function registerActiveFormGuard(guard) {
  guardStack.push(guard);
  return () => {
    const idx = guardStack.lastIndexOf(guard);
    if (idx !== -1) guardStack.splice(idx, 1);
  };
}

function getActiveGuard() {
  return guardStack[guardStack.length - 1] || null;
}

/**
 * Llamar antes de navegar desde UI compartida/global (sidebar, nav superior) que no
 * conoce ningún formulario guardado en particular.
 *
 * @returns {boolean} true si un guard activo interceptó la navegación (mostrará su propio
 *   diálogo de confirmación y navegará él mismo si el usuario confirma) — quien llama NO
 *   debe navegar. false si no hay guard activo — quien llama debe navegar normalmente.
 */
export function requestAppNavigation(to, options) {
  const guard = getActiveGuard();
  if (guard) {
    guard.requestNavigation(to, options);
    return true;
  }
  return false;
}

// Solo para tests: limpia el estado entre casos.
export function __resetNavigationGuardRegistryForTests() {
  guardStack.length = 0;
}
