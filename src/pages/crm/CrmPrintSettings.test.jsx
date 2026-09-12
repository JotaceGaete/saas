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
