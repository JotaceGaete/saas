import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const patchBusinessMock = vi.fn();
let business = { id: 'biz1', operatingDays: null };

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ business, patchBusiness: patchBusinessMock }),
}));

vi.mock('../../../services/waBusinessService', () => ({
  updateBusiness: vi.fn(),
}));

import { updateBusiness } from '../../../services/waBusinessService';
import OperatingDaysSettings from './OperatingDaysSettings';

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

beforeEach(() => {
  vi.clearAllMocks();
  business = { id: 'biz1', operatingDays: null };
});

describe('OperatingDaysSettings — sin configuración (legacy)', () => {
  it('arranca con los 7 días marcados', () => {
    render(<OperatingDaysSettings />);
    for (const label of WEEKDAY_LABELS) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    }
  });

  it('el botón Guardar está habilitado (hay al menos un día marcado)', () => {
    render(<OperatingDaysSettings />);
    expect(screen.getByRole('button', { name: /Guardar días de operación/i })).toBeEnabled();
  });
});

describe('OperatingDaysSettings — con configuración existente', () => {
  it('refleja business.operatingDays (domingo desmarcado)', () => {
    business = {
      id: 'biz1',
      operatingDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
    };
    render(<OperatingDaysSettings />);
    expect(screen.getByRole('checkbox', { name: 'Domingo' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Lunes' })).toBeChecked();
  });
});

describe('OperatingDaysSettings — validación', () => {
  it('desmarcar todos los días deshabilita Guardar y muestra el error de validación', () => {
    render(<OperatingDaysSettings />);
    for (const label of WEEKDAY_LABELS) fireEvent.click(screen.getByRole('checkbox', { name: label }));
    expect(screen.getByText('Debes dejar marcado al menos un día operativo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar días de operación/i })).toBeDisabled();
  });
});

describe('OperatingDaysSettings — guardar', () => {
  it('al guardar, llama a updateBusiness con la selección actual', async () => {
    updateBusiness.mockResolvedValue({ data: { id: 'biz1', operatingDays: { monday: false, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true } }, error: null });
    render(<OperatingDaysSettings />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Lunes' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar días de operación/i }));

    await waitFor(() => expect(updateBusiness).toHaveBeenCalledWith('biz1', {
      operatingDays: { monday: false, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    }));
  });

  it('en éxito, aplica el negocio actualizado con patchBusiness y muestra "Guardado"', async () => {
    const updated = { id: 'biz1', operatingDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true } };
    updateBusiness.mockResolvedValue({ data: updated, error: null });
    render(<OperatingDaysSettings />);

    fireEvent.click(screen.getByRole('button', { name: /Guardar días de operación/i }));

    await waitFor(() => expect(patchBusinessMock).toHaveBeenCalledWith(updated));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('si updateBusiness falla, muestra un banner de error y no llama a patchBusiness', async () => {
    updateBusiness.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<OperatingDaysSettings />);

    fireEvent.click(screen.getByRole('button', { name: /Guardar días de operación/i }));

    await waitFor(() => expect(screen.getByText(/No se pudo guardar la configuración/i)).toBeInTheDocument());
    expect(patchBusinessMock).not.toHaveBeenCalled();
  });
});
