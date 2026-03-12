# Imágenes en Cloudflare R2

Las imágenes (logos, portadas, fotos de productos) se suben a **Cloudflare R2** en lugar de Supabase Storage. El frontend obtiene una URL firmada (presigned) desde la Edge Function `upload-image-r2` y sube el archivo directamente a R2.

## 1. Crear bucket R2 y obtener credenciales

1. En [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → **Create bucket** (ej. `gong-images`).
2. Habilitar acceso público al bucket:
   - **R2** → tu bucket → **Settings** → **Public access**: activar "Allow Access" y anotar la URL pública (ej. `https://pub-xxxxx.r2.dev`) o configurar un **custom domain** (ej. `https://images.gong.cl`).
3. Crear API token para R2:
   - **R2** → **Manage R2 API Tokens** → **Create API token**.
   - Permisos: Object Read & Write para el bucket.
   - Anota **Access Key ID** y **Secret Access Key**.
4. **Account ID**: en la barra lateral de Cloudflare (Overview), copia el **Account ID**.

## 2. Variables de entorno en Supabase (Edge Function)

En **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**, añade:

| Nombre | Descripción | Ejemplo |
|--------|-------------|---------|
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `a1b2c3d4e5f6...` |
| `R2_ACCESS_KEY_ID` | Access Key del token R2 | `...` |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key del token R2 | `...` |
| `R2_BUCKET_NAME` | Nombre del bucket R2 | `gong-images` |
| `R2_PUBLIC_URL` | URL base pública del bucket (sin barra final) | `https://pub-xxxxx.r2.dev` o `https://images.gong.cl` |

Las variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles en Edge Functions.

## 3. Desplegar la Edge Function

```bash
supabase functions deploy upload-image-r2
```

## 4. Probar

Subir un logo, portada o imagen de producto desde la app. Las nuevas subidas irán a R2 y la URL devuelta será la de `R2_PUBLIC_URL`.

---

## Migrar imágenes existentes de Supabase Storage a R2

Hay un script en el repo que descarga cada imagen desde Supabase Storage, la sube a R2 y actualiza la base de datos.

### Variables de entorno para el script

Añade a tu `.env` (o exporta en la terminal) **solo para ejecutar la migración**:

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` o `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Supabase → Project Settings → API) |
| `R2_ACCOUNT_ID` | Account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key del token R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key del token R2 |
| `R2_BUCKET_NAME` | Nombre del bucket (ej. `saasgong`) |
| `R2_PUBLIC_URL` | URL pública del bucket (ej. `https://media.gong.cl`) |

**Importante:** No subas `SUPABASE_SERVICE_ROLE_KEY` al repositorio. Úsala solo en local o en un entorno seguro.

### Cómo ejecutar la migración

1. Instalar dependencias (incluye `@aws-sdk/client-s3` en devDependencies):
   ```bash
   npm install
   ```

2. **Dry-run (recomendado primero):** escanear sin subir ni actualizar la BD:
   ```bash
   npm run migrate:images-r2 -- --dry-run
   ```
   Verás qué imágenes se migrarían y se generará un reporte en `reports/`.

3. Ejecutar la migración real:
   ```bash
   npm run migrate:images-r2
   ```
   O directamente: `node scripts/migrate-images-to-r2.mjs [--dry-run]`

4. El script:
   - **Idempotente:** si una URL ya apunta a `R2_PUBLIC_URL`, no la vuelve a procesar.
   - Lee todos los negocios y productos; para cada URL de Supabase Storage: descarga, sube a R2, actualiza la BD.
   - **Rutas en R2:** `businesses/{business_id}/logo/...`, `businesses/{business_id}/cover/...`, `businesses/{business_id}/products/{product_id}/...`
   - Genera un **reporte** en `reports/` (JSON y CSV) con: tabla, id, campo, url_origen, r2_key, url_destino, estado, error.
   - Al final muestra resumen: total detectadas, migradas, omitidas, con error.

5. Revisar la app: logos, portadas e imágenes de productos deben verse desde `R2_PUBLIC_URL`.

6. (Opcional) Borrar los objetos en los buckets de Supabase Storage para dejar de usar espacio allí.
