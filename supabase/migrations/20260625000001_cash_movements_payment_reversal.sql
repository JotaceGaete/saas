-- Añade 'payment_reversal' a la lista permitida de categorías de crm_cash_movements.
-- Se usa cuando se anula un pago y se crea el movimiento de reverso en caja.

ALTER TABLE public.crm_cash_movements
  DROP CONSTRAINT IF EXISTS crm_cash_movements_category_check;

ALTER TABLE public.crm_cash_movements
  ADD CONSTRAINT crm_cash_movements_category_check CHECK (
    category IN (
      'owner_withdrawal', 'bank_deposit',
      'supplies', 'utilities', 'rent', 'services', 'taxes', 'salaries',
      'other_expense', 'cash_fund', 'correction', 'other',
      'payment_reversal'
    )
  );
