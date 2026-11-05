#!/bin/bash
# Verifica cada migración recuperada contra MANIFEST.tsv. Criterio: md5 de los bytes UTF-8 (el campo chars es caracteres, no bytes).
cd "$(dirname "$0")"
ok=0; bad=0; missing=0
while IFS=$'\t' read -r v name n chars md5; do
  case "$v" in ''|\#*|version) continue;; esac
  f=$(ls migrations/${v}_*.sql 2>/dev/null | head -1)
  if [ -z "$f" ]; then echo "FALTA $v $name"; missing=$((missing+1)); continue; fi
  got=$(md5sum < "$f" | cut -d' ' -f1)
  if [ "$got" = "$md5" ]; then ok=$((ok+1)); else echo "MISMATCH $v $name"; bad=$((bad+1)); fi
done < MANIFEST.tsv
echo "OK=$ok MISMATCH=$bad FALTAN=$missing"
