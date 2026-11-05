#!/bin/bash
# Verifica MANIFEST.tsv contra los archivos del repositorio. Criterio: md5 de los bytes UTF-8 (el campo
# chars es caracteres, no bytes).
#  - Filas de 5 columnas (piloto recuperado): migrations/<version>_*.sql debe tener el md5 del registro.
#  - Filas de 8 columnas (fiscal posterior): el archivo indicado debe tener md5_archivo; si la verificación
#    es registro=archivo, además md5_archivo debe ser igual al md5 del registro.
cd "$(dirname "$0")"
ok=0; bad=0; missing=0; snap=0
while IFS=$'\t' read -r v name n chars md5 file fmd5 how; do
  case "$v" in ''|\#*|version) continue;; esac
  if [ -z "$file" ]; then
    f=$(ls migrations/${v}_*.sql 2>/dev/null | head -1)
    if [ -z "$f" ]; then echo "FALTA $v $name"; missing=$((missing+1)); continue; fi
    got=$(md5sum < "$f" | cut -d' ' -f1)
    if [ "$got" = "$md5" ]; then ok=$((ok+1)); else echo "MISMATCH $v $name"; bad=$((bad+1)); fi
    continue
  fi
  if [ "$file" = "-" ]; then snap=$((snap+1)); continue; fi
  if [ ! -f "$file" ]; then echo "FALTA $v $name ($file)"; missing=$((missing+1)); continue; fi
  got=$(md5sum < "$file" | cut -d' ' -f1)
  if [ "$got" != "$fmd5" ]; then echo "MISMATCH $v $name (archivo cambió)"; bad=$((bad+1)); continue; fi
  if [ "$how" = "registro=archivo" ] && [ "$fmd5" != "$md5" ]; then echo "MISMATCH $v $name (registro)"; bad=$((bad+1)); continue; fi
  ok=$((ok+1))
done < MANIFEST.tsv
echo "OK=$ok MISMATCH=$bad FALTAN=$missing SIN_ARCHIVO=$snap"
