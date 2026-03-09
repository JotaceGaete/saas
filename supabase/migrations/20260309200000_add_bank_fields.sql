-- Add bank account fields to wa_businesses table
ALTER TABLE public.wa_businesses
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account_type TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
ADD COLUMN IF NOT EXISTS bank_rut TEXT,
ADD COLUMN IF NOT EXISTS bank_email TEXT;
