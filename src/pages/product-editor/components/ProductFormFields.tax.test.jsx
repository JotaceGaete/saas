import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('components/AppIcon', () => ({ default: () => null }));
vi.mock('../../../services/waBusinessService', () => ({ createBusinessCategory: vi.fn() }));

const { default: ProductFormFields } = await import('./ProductFormFields');

afterEach(() => cleanup());

const baseProps = { formData: { nombre: 'Café', precio: 1190, taxTreatment: '' }, errors: {}, onChange: vi.fn() };

describe('editor de productos: IVA en la boleta electrónica', () => {
  it('sin facturación electrónica el campo no aparece', () => {
    render(<ProductFormFields {...baseProps} />);
    expect(screen.queryByLabelText('IVA en la boleta electrónica')).toBeNull();
  });

  it('con facturación: «usar el de mi negocio» por defecto y las tres categorías', () => {
    const onChange = vi.fn();
    render(<ProductFormFields {...baseProps} onChange={onChange} showTaxTreatment />);
    const select = screen.getByLabelText('IVA en la boleta electrónica');
    expect(select).toHaveValue('');
    const options = Array.from(select.querySelectorAll('option')).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['', 'Usar el de mi negocio (Configuración › Facturación)'],
      ['IVA_AFECTO_19', 'Afecto a IVA (19 %)'],
      ['EXENTO', 'Exento de IVA'],
      ['NO_AFECTO', 'No afecto a IVA'],
    ]);
    fireEvent.change(select, { target: { value: 'EXENTO' } });
    expect(onChange).toHaveBeenCalledWith('taxTreatment', 'EXENTO');
  });
});
