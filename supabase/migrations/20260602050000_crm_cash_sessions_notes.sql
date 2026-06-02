-- Caja diaria: notas por sesion e indice por negocio/fecha

ALTER TABLE public.crm_cash_sessions
ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS crm_cash_sessions_business_date_idx
ON public.crm_cash_sessions(business_id, date);
