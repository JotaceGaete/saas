/**
 * PROVEEDORES-CORE-4B — /crm/compras deja de ser un módulo independiente.
 *
 * Escenario 8: /crm/compras redirige a /proveedores.
 * Escenario 9: el formulario legacy (CrmPurchases.jsx) ya no es accesible.
 *
 * Routes.jsx importa estáticamente ~80 páginas (muchas con dependencias de
 * red/Supabase a nivel de módulo) -- montar el árbol completo con
 * react-router para navegar a /crm/compras traería consigo todo ese costo
 * y fragilidad sin aportar más certeza que la que da inspeccionar
 * directamente la definición de la ruta y confirmar que el componente
 * legacy fue eliminado del árbol de código (no solo "no importado").
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routesSource = fs.readFileSync(path.resolve(__dirname, './Routes.jsx'), 'utf8');

describe('8. /crm/compras redirige a /proveedores', () => {
  it('la ruta /crm/compras es un <Navigate to="/proveedores" replace />, sin RequireCrm ni FeatureGate', () => {
    const match = routesSource.match(/<Route path="\/crm\/compras"\s+element=\{([^}]*)\}\s*\/>/);
    expect(match).not.toBeNull();
    const element = match[1];
    expect(element).toContain('<Navigate to="/proveedores" replace />');
    expect(element).not.toContain('RequireCrm');
    expect(element).not.toContain('FeatureGate');
    expect(element).toContain('RequireAuth');
  });

  it('/proveedores sigue montado sin cambios (mismo destino del redirect)', () => {
    expect(routesSource).toContain('<Route path="/proveedores" element={<RequireAuth><SuppliersPage /></RequireAuth>} />');
  });
});

describe('9. El formulario legacy CrmPurchases.jsx ya no es accesible', () => {
  it('el archivo CrmPurchases.jsx fue eliminado del repo', () => {
    const legacyPath = path.resolve(__dirname, './pages/crm/CrmPurchases.jsx');
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it('Routes.jsx ya no importa ni referencia CrmPurchases', () => {
    expect(routesSource).not.toContain('CrmPurchases');
  });
});
