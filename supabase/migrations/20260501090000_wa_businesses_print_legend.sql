ALTER TABLE public.wa_businesses
ADD COLUMN IF NOT EXISTS print_legend text;

COMMENT ON COLUMN public.wa_businesses.print_legend IS
'Leyenda opcional para imprimir al final del ticket térmico de pedidos.';
