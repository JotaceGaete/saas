import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <main>{children}</main> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle }) => <header>{title}{subtitle}</header> }));

let business = { id: 'biz1', name: 'Mi Negocio', currency: 'CLP' };
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ business }) }));

const connectMock = vi.fn();
const listPrintersMock = vi.fn();
const printReceiptMock = vi.fn();
const isAvailableMock = vi.fn();

vi.mock('lib/printing/printService', () => ({
  printService: {
    isAvailable: (...a) => isAvailableMock(...a),
    connect: (...a) => connectMock(...a),
    disconnect: vi.fn(),
    listPrinters: (...a) => listPrintersMock(...a),
    printReceipt: (...a) => printReceiptMock(...a),
  },
}));

import CrmPrintSettings from './CrmPrintSettings';
import { buildPrinterConfigKey } from 'lib/printing/printerConfigStorage';

beforeEach(() => {
  window.localStorage.clear();
  business = { id: 'biz1', name: 'Mi Negocio', currency: 'CLP' };
  connectMock.mockReset().mockResolvedValue();
  listPrintersMock.mockReset().mockResolvedValue(['Impresora A', 'Impresora B']);
  printReceiptMock.mockReset().mockResolvedValue();
  isAvailableMock.mockReset().mockReturnValue(true);
});

afterEach(() => cleanup());

describe('CrmPrintSettings — estado de conexión', () => {
  it('conecta y lista impresoras al montar; muestra "Conectado"', async () => {
    render(<CrmPrintSettings />);
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Impresora A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Impresora B' })).toBeInTheDocument();
  });

  it('si QZ Tray no está disponible, muestra "Desconectado" y un mensaje de ayuda', async () => {
    connectMock.mockRejectedValue(new Error('No se pudo abrir el socket'));
    isAvailableMock.mockReturnValue(false);
    render(<CrmPrintSettings />);
    expect(await screen.findByText('Desconectado')).toBeInTheDocument();
    expect(screen.getByText(/No se detectó QZ Tray/)).toBeInTheDocument();
  });

  it('conectado pero sin impresoras detectadas lo indica explícitamente', async () => {
    listPrintersMock.mockResolvedValue([]);
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(await screen.findByText(/no reporta impresoras instaladas/)).toBeInTheDocument();
  });

  it('"Actualizar impresoras" vuelve a conectar y listar', async () => {
    render(<CrmPrintSettings />);
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Actualizar impresoras/ }));
    await waitFor(() => expect(connectMock).toHaveBeenCalledTimes(2));
    expect(listPrintersMock).toHaveBeenCalledTimes(2);
  });
});

describe('CrmPrintSettings — selección y persistencia local', () => {
  it('el papel se muestra fijo en 80 mm', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByText('80 mm')).toBeInTheDocument();
  });

  it('elegir una impresora la persiste en localStorage bajo la key del negocio', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora B' } });

    const key = buildPrinterConfigKey('biz1');
    const stored = JSON.parse(window.localStorage.getItem(key));
    expect(stored.printerName).toBe('Impresora B');
  });

  it('restaura la impresora guardada de una sesión anterior', async () => {
    window.localStorage.setItem(buildPrinterConfigKey('biz1'), JSON.stringify({ schemaVersion: 1, printerName: 'Impresora A', paperWidthMm: 80 }));
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('combobox')).toHaveValue('Impresora A');
  });

  it('avisa si la impresora guardada ya no está disponible en este equipo', async () => {
    window.localStorage.setItem(buildPrinterConfigKey('biz1'), JSON.stringify({ schemaVersion: 1, printerName: 'Impresora vieja', paperWidthMm: 80 }));
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(await screen.findByText(/ya no aparece en este equipo/)).toBeInTheDocument();
  });
});

describe('CrmPrintSettings — imprimir ticket de prueba', () => {
  it('el botón de imprimir está deshabilitado sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Imprimir ticket de prueba/ })).toBeDisabled();
  });

  it('imprime con la impresora seleccionada y muestra confirmación', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const printButton = screen.getByRole('button', { name: /Imprimir ticket de prueba/ });
    expect(printButton).not.toBeDisabled();
    fireEvent.click(printButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.some((l) => l.text.includes('Impresora A'))).toBe(true);
    expect(await screen.findByText('Ticket de prueba enviado a la impresora.')).toBeInTheDocument();
  });

  it('un error al imprimir se muestra sin romper la pantalla', async () => {
    printReceiptMock.mockRejectedValue(new Error('La impresora no responde'));
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });
    fireEvent.click(screen.getByRole('button', { name: /Imprimir ticket de prueba/ }));

    expect(await screen.findByText('La impresora no responde')).toBeInTheDocument();
    expect(screen.getByText('Impresión del TPV')).toBeInTheDocument();
  });

  it('PRINT-4-BUG2: el diagnóstico de imagen (A/B) imprime ambas variantes ESC/POS con texto identificador, sin depender de un logo real', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Diagnóstico de imagen/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.some((l) => l.text?.includes('Antes de Imagen A'))).toBe(true);
    expect(receipt.lines.some((l) => l.text?.includes('Antes de Imagen B'))).toBe(true);
    expect(receipt.lines.filter((l) => l.type === 'rasterBytes')).toHaveLength(2);
    expect(await screen.findByText('Diagnóstico de imagen enviado a la impresora.')).toBeInTheDocument();
  });

  it('PRINT-4-BUG2: el diagnóstico de corte (A/B) imprime ambas variantes con texto identificador, sin cortar de más', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Diagnóstico de corte/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.cut).toBe(false);
    expect(receipt.lines.some((l) => l.text?.includes('Antes de Corte A'))).toBe(true);
    expect(receipt.lines.some((l) => l.text?.includes('Antes de Corte B'))).toBe(true);
    expect(receipt.lines.filter((l) => l.type === 'raw')).toHaveLength(2);
    expect(await screen.findByText('Diagnóstico de corte enviado a la impresora.')).toBeInTheDocument();
  });

  it('los diagnósticos de imagen y corte están deshabilitados sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Diagnóstico de imagen/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Diagnóstico de corte/ })).toBeDisabled();
  });

  it('PRINT-4-BUG6: el diagnóstico de logo (posición) imprime marcas de margen + el logo real del negocio, y pide corte', async () => {
    business = { id: 'biz1', name: 'Mi Negocio', currency: 'CLP', logoUrl: 'https://cdn.example.com/logo.png' };
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Diagnóstico de logo/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'rasterBytes')).toHaveLength(2);
    expect(receipt.lines.some((l) => l.type === 'logo' && l.url === 'https://cdn.example.com/logo.png')).toBe(true);
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de logo enviado a la impresora.')).toBeInTheDocument();
  });

  it('el diagnóstico de logo está deshabilitado sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Diagnóstico de logo/ })).toBeDisabled();
  });

  it('PRINT-4-BUG8: el diagnóstico de geometría imprime 3 bloques rasterBytes en posiciones distintas, y pide corte', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Diagnóstico de geometría/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'rasterBytes')).toHaveLength(3);
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de geometría enviado a la impresora.')).toBeInTheDocument();
  });

  it('el diagnóstico de geometría está deshabilitado sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Diagnóstico de geometría/ })).toBeDisabled();
  });

  it('PRINT-4-BUG9: el diagnóstico de posición explícita (ESC $) imprime 3 bloques `raw` sin relleno, y pide corte', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Diagnóstico de posición explícita/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'raw')).toHaveLength(6); // 3 bloques x (ALIGN_LEFT + comando)
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de posición explícita enviado a la impresora.')).toBeInTheDocument();
  });

  it('el diagnóstico de posición explícita está deshabilitado sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Diagnóstico de posición explícita/ })).toBeDisabled();
  });

  it('PRINT-4-BUG10: la calibración de borde derecho imprime 5 bloques `raw` sin relleno, y pide corte', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Calibración de borde derecho/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'raw')).toHaveLength(10); // 5 bloques x (ALIGN_LEFT + comando)
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de calibración de borde derecho enviado a la impresora.')).toBeInTheDocument();
  });

  it('la calibración de borde derecho está deshabilitada sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Calibración de borde derecho/ })).toBeDisabled();
  });

  it('PRINT-4-BUG11: la calibración fina de borde imprime 6 bloques `raw` sin relleno, y pide corte', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Calibración fina de borde/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'raw')).toHaveLength(12); // 6 bloques x (ALIGN_LEFT + comando)
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de calibración fina de borde enviado a la impresora.')).toBeInTheDocument();
  });

  it('la calibración fina de borde está deshabilitada sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Calibración fina de borde/ })).toBeDisabled();
  });

  it('PRINT-4-BUG12: la calibración de borde de 8 dots imprime 6 bloques `raw` sin relleno, y pide corte', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Calibración de borde \(8 dots\)/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'raw')).toHaveLength(12); // 6 bloques x (ALIGN_LEFT + comando)
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de calibración de borde (8 dots) enviado a la impresora.')).toBeInTheDocument();
  });

  it('la calibración de borde de 8 dots está deshabilitada sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Calibración de borde \(8 dots\)/ })).toBeDisabled();
  });

  it('PRINT-4-BUG13: el diagnóstico de aspecto imprime cuadrado y círculo (2 bloques `raw` de imagen) y pide corte', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const diagButton = screen.getByRole('button', { name: /Diagnóstico de aspecto/ });
    expect(diagButton).not.toBeDisabled();
    fireEvent.click(diagButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.filter((l) => l.type === 'raw')).toHaveLength(4); // 2 formas x (ALIGN_LEFT + comando)
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Diagnóstico de aspecto (cuadrado/círculo) enviado a la impresora.')).toBeInTheDocument();
  });

  it('el diagnóstico de aspecto está deshabilitado sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Diagnóstico de aspecto/ })).toBeDisabled();
  });

  it('PRINT-4-BUG3: la impresión final de validación imprime un ticket completo (logo, items, TOTAL, corte) con datos sintéticos', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

    const finalButton = screen.getByRole('button', { name: /Impresión final de validación/ });
    expect(finalButton).not.toBeDisabled();
    fireEvent.click(finalButton);

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    const [receipt, target] = printReceiptMock.mock.calls[0];
    expect(target).toEqual({ printerName: 'Impresora A' });
    expect(receipt.lines.some((l) => l.type === 'total')).toBe(true);
    expect(receipt.cut).toBe(true);
    expect(await screen.findByText('Impresión final de validación enviada a la impresora.')).toBeInTheDocument();
  });

  it('la impresión final de validación está deshabilitada sin impresora seleccionada', async () => {
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    expect(screen.getByRole('button', { name: /Impresión final de validación/ })).toBeDisabled();
  });

  describe('PRINT-5 — modo de impresión (Recomendado/Compatibilidad/Solo texto)', () => {
    it('por defecto (sin config guardada) el modo Recomendado aparece seleccionado', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      expect(screen.getByRole('button', { name: /^Recomendado/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /^Compatibilidad/ })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: /Solo texto/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('ningún texto ESC/POS (ESC *, GS v 0, GS V, ESC $) aparece fuera de "Opciones avanzadas"', async () => {
      const { container } = render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      const clone = container.cloneNode(true);
      clone.querySelector('details')?.remove();
      expect(clone.textContent).not.toMatch(/ESC \*|GS v 0|GS V|ESC \$/);
    });

    it('elegir "Compatibilidad" persiste imageMode rasterGsV0 y cutStrategyId gs-v-legacy', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      fireEvent.click(screen.getByRole('button', { name: /^Compatibilidad/ }));

      const key = buildPrinterConfigKey('biz1');
      const stored = JSON.parse(window.localStorage.getItem(key));
      expect(stored.profileId).toBe('compatibility80');
      expect(stored.imageMode).toBe('rasterGsV0');
      expect(stored.cutStrategyId).toBe('gs-v-legacy');
      expect(stored.printLogo).toBe(true);
      expect(screen.getByRole('button', { name: /^Compatibilidad/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('elegir "Solo texto" persiste printLogo false e imageMode none, y deshabilita "Probar logo"', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      fireEvent.click(screen.getByRole('button', { name: /Solo texto/ }));

      const key = buildPrinterConfigKey('biz1');
      const stored = JSON.parse(window.localStorage.getItem(key));
      expect(stored.profileId).toBe('textOnly80');
      expect(stored.printLogo).toBe(false);
      expect(stored.imageMode).toBe('none');
      expect(screen.getByRole('button', { name: /Probar logo/ })).toBeDisabled();
      expect(screen.getByText(/no imprime logo/)).toBeInTheDocument();
    });

    it('volver a "Recomendado" después de "Solo texto" restaura printLogo true', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });
      fireEvent.click(screen.getByRole('button', { name: /Solo texto/ }));
      fireEvent.click(screen.getByRole('button', { name: /^Recomendado/ }));

      const key = buildPrinterConfigKey('biz1');
      const stored = JSON.parse(window.localStorage.getItem(key));
      expect(stored.profileId).toBe('generic80');
      expect(stored.printLogo).toBe(true);
      expect(screen.getByRole('button', { name: /Probar logo/ })).not.toBeDisabled();
    });
  });

  describe('PRINT-5 — pruebas simples (Probar logo / Probar corte)', () => {
    it('"Probar logo" imprime un ticket con la línea de logo del negocio', async () => {
      business = { id: 'biz1', name: 'Mi Negocio', currency: 'CLP', logoUrl: 'https://cdn.example.com/logo.png' };
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

      fireEvent.click(screen.getByRole('button', { name: /Probar logo/ }));

      await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
      const [receipt, target] = printReceiptMock.mock.calls[0];
      expect(target).toEqual({ printerName: 'Impresora A' });
      expect(receipt.lines.some((l) => l.type === 'logo' && l.url === 'https://cdn.example.com/logo.png')).toBe(true);
      expect(await screen.findByText('Prueba de logo enviada a la impresora.')).toBeInTheDocument();
    });

    it('"Probar logo" sin logo configurado igual imprime (mensaje en el ticket, nunca falla)', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

      fireEvent.click(screen.getByRole('button', { name: /Probar logo/ }));

      await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
      const [receipt] = printReceiptMock.mock.calls[0];
      expect(receipt.lines.some((l) => l.type === 'logo')).toBe(false);
      expect(await screen.findByText('Prueba de logo enviada a la impresora.')).toBeInTheDocument();
    });

    it('"Probar corte" imprime un ticket corto y pide corte', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });

      fireEvent.click(screen.getByRole('button', { name: /Probar corte/ }));

      await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
      const [receipt, target] = printReceiptMock.mock.calls[0];
      expect(target).toEqual({ printerName: 'Impresora A' });
      expect(receipt.cut).toBe(true);
      expect(await screen.findByText('Prueba de corte enviada a la impresora.')).toBeInTheDocument();
    });

    it('"Probar logo" y "Probar corte" están deshabilitados sin impresora seleccionada', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      expect(screen.getByRole('button', { name: /Probar logo/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Probar corte/ })).toBeDisabled();
    });
  });

  describe('PRINT-5 — Opciones avanzadas colapsadas por defecto', () => {
    it('el bloque "Opciones avanzadas" existe como <details> colapsado (sin el atributo open)', async () => {
      render(<CrmPrintSettings />);
      await screen.findByText('Conectado');
      const summary = screen.getByText('Opciones avanzadas');
      const details = summary.closest('details');
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute('open');
    });
  });

  it('nunca usa window.print ni abre una pestaña nueva', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<CrmPrintSettings />);
    await screen.findByText('Conectado');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Impresora A' } });
    fireEvent.click(screen.getByRole('button', { name: /Imprimir ticket de prueba/ }));
    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));

    expect(printSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    printSpy.mockRestore();
    openSpy.mockRestore();
  });
});
