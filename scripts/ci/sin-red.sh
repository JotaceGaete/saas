#!/usr/bin/env bash
# Ejecuta un comando SIN ACCESO A LA RED: un espacio de red propio con solo loopback. Lo usa la CI
# para que ninguna prueba pueda llegar a Supabase, DTE Core, Mercado Pago ni a ningún servicio real,
# aunque una prueba lo intentara. El comando corre como el usuario actual, con su entorno.
set -euo pipefail
[ "$#" -gt 0 ] || { echo "uso: $0 <comando> [args...]" >&2; exit 2; }
command -v ip >/dev/null || { echo "sin-red.sh: falta el comando ip (iproute2)" >&2; exit 3; }
uid=$(id -u); gid=$(id -g)
run_as_user='ip link set lo up && exec setpriv --reuid="$0" --regid="$1" --init-groups -- "${@:2}"'
if [ "$uid" = 0 ]; then
  exec unshare --net -- bash -c "$run_as_user" "$uid" "$gid" "$@"
fi
exec sudo -E env "PATH=$PATH" "HOME=$HOME" unshare --net -- bash -c "$run_as_user" "$uid" "$gid" "$@"
