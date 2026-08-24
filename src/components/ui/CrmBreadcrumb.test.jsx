import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CrmBreadcrumb from './CrmBreadcrumb';

function renderBreadcrumb(section) {
  return render(
    <MemoryRouter>
      <CrmBreadcrumb section={section} />
    </MemoryRouter>,
  );
}

describe('CrmBreadcrumb — renombrado de "CRM" (Paso 1)', () => {
  it('no muestra el texto "CRM"', () => {
    renderBreadcrumb('Notas de venta');
    expect(screen.queryByText('CRM')).not.toBeInTheDocument();
  });

  it('el primer segmento usa el label en lenguaje llano "Resumen" y enlaza a /crm', () => {
    renderBreadcrumb('Notas de venta');
    const link = screen.getByText('Resumen');
    expect(link.closest('a')).toHaveAttribute('href', '/crm');
    expect(screen.getByText('Notas de venta')).toBeInTheDocument();
  });
});
