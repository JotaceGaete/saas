-- Habilitar Realtime para wa_orders para que el dashboard reciba INSERT en tiempo real
-- Sin esto, el filtro postgres_changes por business_id no emite eventos.
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_orders;
