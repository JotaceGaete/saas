/**
 * CheckoutEmailOptional — campo "Correo electrónico (opcional)" del
 * checkout público (EMAIL-PAYMENTS-2). Componente presentacional puro
 * (sin lógica de validación propia -- eso vive en utils/customerEmail.js
 * y en el submit handler de cada página, igual que CheckoutPhoneOptional).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CheckoutEmailOptional from './CheckoutEmailOptional';
import { isValidCustomerEmail, normalizeCustomerEmailInput } from '../../utils/customerEmail';

describe('CheckoutEmailOptional — render', () => {
  it('renderiza el label "Correo electrónico (opcional)" (variant catalog)', () => {
    render(<CheckoutEmailOptional variant="catalog" value="" onValueChange={() => {}} />);
    expect(screen.getByText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByText(/\(opcional\)/i)).toBeInTheDocument();
  });

  it('renderiza el label "Correo electrónico (opcional)" (variant order)', () => {
    render(<CheckoutEmailOptional variant="order" value="" onValueChange={() => {}} />);
    expect(screen.getByText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByText(/\(opcional\)/i)).toBeInTheDocument();
  });

  it('el input es type="email"', () => {
    render(<CheckoutEmailOptional variant="catalog" value="" onValueChange={() => {}} />);
    const input = screen.getByPlaceholderText(/tucorreo@ejemplo\.com/i);
    expect(input).toHaveAttribute('type', 'email');
  });

  it('el input tiene autoComplete="email"', () => {
    render(<CheckoutEmailOptional variant="catalog" value="" onValueChange={() => {}} />);
    const input = screen.getByPlaceholderText(/tucorreo@ejemplo\.com/i);
    expect(input).toHaveAttribute('autocomplete', 'email');
  });

  it('texto de ayuda es exclusivamente transaccional -- confirmación de pago, nunca marketing/newsletter/consentimiento', () => {
    render(<CheckoutEmailOptional variant="catalog" value="" onValueChange={() => {}} />);
    expect(screen.getByText(/te enviaremos la confirmación de tu pago a este correo/i)).toBeInTheDocument();
    expect(screen.queryByText(/newsletter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/marketing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/promocion/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/acepto/i)).not.toBeInTheDocument();
  });
});

describe('CheckoutEmailOptional — interacción', () => {
  it('llama a onValueChange con el valor crudo tipeado por el usuario', () => {
    const onValueChange = vi.fn();
    render(<CheckoutEmailOptional variant="catalog" value="" onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText(/tucorreo@ejemplo\.com/i);
    fireEvent.change(input, { target: { value: 'comprador@example.com' } });
    expect(onValueChange).toHaveBeenCalledWith('comprador@example.com');
  });

  it('cuando se pasa error, muestra el mensaje en vez del texto de ayuda', () => {
    render(<CheckoutEmailOptional variant="catalog" value="mal" onValueChange={() => {}} error="Ingresa un correo electrónico válido." />);
    expect(screen.getByText(/ingresa un correo electrónico válido/i)).toBeInTheDocument();
    expect(screen.queryByText(/te enviaremos la confirmación de tu pago a este correo/i)).not.toBeInTheDocument();
  });

  it('sin error, muestra el texto de ayuda (no hay feedback de error)', () => {
    render(<CheckoutEmailOptional variant="order" value="comprador@example.com" onValueChange={() => {}} />);
    expect(screen.getByText(/te enviaremos la confirmación de tu pago a este correo/i)).toBeInTheDocument();
  });
});

// ─── Cobertura de utils/customerEmail.js a través del comportamiento
// esperado del campo: vacío es válido, trim, formato inválido, longitud
// máxima, CR/LF. La validación en sí vive en customerEmail.js (con su
// propio test file) -- acá se confirma que el componente es compatible
// con esa validación (mismo tipo de valor que recibe/entrega).
describe('CheckoutEmailOptional — compatibilidad con la validación de utils/customerEmail', () => {
  it('vacío es válido (campo opcional)', () => {
    expect(isValidCustomerEmail('')).toBe(true);
  });

  it('el valor tipeado con espacios se normaliza con trim antes de validar/enviar', () => {
    expect(normalizeCustomerEmailInput('  comprador@example.com  ')).toBe('comprador@example.com');
  });

  it('email válido pasa la validación', () => {
    expect(isValidCustomerEmail('comprador@example.com')).toBe(true);
  });

  it('email inválido (formato) no pasa la validación', () => {
    expect(isValidCustomerEmail('no-es-un-email')).toBe(false);
  });

  it('longitud > 254 no pasa la validación', () => {
    const tooLong = `${'a'.repeat(250)}@x.com`;
    expect(isValidCustomerEmail(tooLong)).toBe(false);
  });

  it('CR/LF no pasa la validación', () => {
    expect(isValidCustomerEmail('foo@bar.com\r\nBcc: x@evil.com')).toBe(false);
  });
});
