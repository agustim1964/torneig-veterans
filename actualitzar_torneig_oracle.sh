#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$HOME/torneig-veterans"
BRANCH="main"
PM2_APP=""  # Opcional: posa el nom exacte de l'aplicacio PM2. Buit = deteccio segura.
BACKUP_ROOT="$HOME/backups-torneig-veterans"
HEALTH_URL="https://competicio.masip.info/" # Canvia-ho si la portada no respon 2xx o 3xx

fail() { echo "ERROR: $*" >&2; exit 1; }
trap 'echo "ERROR: fallada a la linia $LINENO. No es confirma el desplegament." >&2' ERR

command -v git >/dev/null || fail "No hi ha git"
command -v npm >/dev/null || fail "No hi ha npm"
command -v pm2 >/dev/null || fail "No hi ha pm2"
command -v curl >/dev/null || fail "No hi ha curl"
[[ -d "$PROJECT_DIR/.git" ]] || fail "No hi ha repositori a $PROJECT_DIR"
cd "$PROJECT_DIR"

[[ "$(git branch --show-current)" == "$BRANCH" ]] || fail "La branca activa no es $BRANCH"
[[ -z "$(git ls-files -u)" ]] || fail "Hi ha conflictes Git pendents: resol-los manualment"

mkdir -p "$BACKUP_ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP"

# Copia externa al repositori: evita que el backup sigui eliminat per un desplegament futur.
echo "[1/6] Guardant copia de seguretat a $BACKUP"
git status --short > "$BACKUP/git-status-abans.txt"
git rev-parse HEAD > "$BACKUP/commit-abans.txt"
git diff HEAD --binary > "$BACKUP/canvis-controlats.patch"
# Arxiu dels fitxers modificats i no seguits, excloent .git i node_modules.
# El tar de tot el codi cobreix fins i tot fitxers ignorats que siguin rellevants.
tar -czf "$BACKUP/projecte-abans.tar.gz" --exclude='./.git' --exclude='./node_modules' --exclude='./backups' -C "$PROJECT_DIR" .

# No s'inclouen configuracions secretes a Git; la copia pot contenir secrets. Permisos privats.
chmod 700 "$BACKUP_ROOT" "$BACKUP"
chmod 600 "$BACKUP"/*

echo "[2/6] Consultat GitHub..."
git fetch --prune origin "$BRANCH"
TARGET="$(git rev-parse "origin/$BRANCH")"
CURRENT="$(git rev-parse HEAD)"

# Comprova si el desplegament seria de tipus fast-forward.
git merge-base --is-ancestor "$CURRENT" "$TARGET" || fail "La branca del servidor ha divergit de GitHub; revisio manual necessaria"

# Guarda canvis locals abans d'actualitzar; no se'ls torna a aplicar automàticament.
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "[3/6] Desant modificacions locals en git stash..."
  git stash push --include-untracked -m "Desplegament segur $STAMP" >/dev/null
else
  echo "[3/6] Cap canvi local pendent"
fi

# Compara manifestos de dependències entre commits; si es la primera execucio sense node_modules, instal.la igualment.
DEPS_CHANGED=0
if [[ "$CURRENT" != "$TARGET" ]] && git diff --name-only "$CURRENT" "$TARGET" -- package.json package-lock.json npm-shrinkwrap.json | grep -q .; then
  DEPS_CHANGED=1
fi

echo "[4/6] Actualitzant el projecte..."
git merge --ff-only "$TARGET"
if [[ "$DEPS_CHANGED" -eq 1 || ! -d node_modules ]]; then
  echo "Dependències canviades o absents: npm install"
  npm install --no-audit --no-fund
else
  echo "Dependències sense canvis: s'omet npm install"
fi

# Resol el proces sense reiniciar altres aplicacions de la VM.
echo "[5/6] Reiniciant PM2..."
if [[ -n "$PM2_APP" ]]; then
  APP="$PM2_APP"
else
  # Utilitza el nom si només hi ha una aplicacio PM2.
  APP="$(pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{let a=JSON.parse(s);if(a.length!==1)process.exit(2);console.log(a[0].name)})')" || fail "Hi ha 0 o mes d'1 processos PM2; configura PM2_APP a l'script"
fi
pm2 restart "$APP" --update-env
sleep 3

# PM2 pot informar exit 0 malgrat processos en error; comprova estat via JSON.
echo "[6/6] Validant estat..."
pm2 jlist | APP_NAME="$APP" node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const a=JSON.parse(s);const p=a.find(x=>x.name===process.env.APP_NAME);if(!p||p.pm2_env.status!=="online") {console.error("ERROR: proces PM2 no online");process.exit(1)}console.log("PM2 online:",p.name,"pid",p.pid)})'
echo "Comprovant resposta web de $HEALTH_URL ..."
HEALTH_OK=0
for attempt in 1 2 3 4 5; do
  if curl --silent --show-error --location --fail --max-time 10 --output /dev/null "$HEALTH_URL"; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done
[[ "$HEALTH_OK" -eq 1 ]] || fail "PM2 esta online pero el lloc web no respon correctament: $HEALTH_URL"
git status --short
printf '\nOK: commit desplegat: %s\n' "$(git rev-parse --short HEAD)"
printf 'Backup: %s\n' "$BACKUP"
echo "Comprovacio HTTP i PM2 correctes."
