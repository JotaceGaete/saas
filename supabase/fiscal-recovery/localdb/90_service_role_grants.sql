-- Solo base LOCAL de pruebas: privilegios de service_role sobre el esquema PUBLIC, como en producción
-- (allí service_role tiene todos los permisos sobre las tablas de public).
-- El esquema fiscal NO se toca aquí: sus permisos son los de producción (80_permisos_produccion.sql)
-- más los que conceden las propias migraciones A–G.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
