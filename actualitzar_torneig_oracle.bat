@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "SSH_KEY=%USERPROFILE%\.ssh\torneig-oracle.key"
set "SSH_HOST=ubuntu@competicio.masip.info"
set "REMOTE_SCRIPT=/tmp/actualitzar_torneig_oracle_%RANDOM%_%RANDOM%.sh"
set "LOCAL_SCRIPT=%~dp0actualitzar_torneig_oracle.sh"

echo ============================================================
echo   ACTUALITZACIO TORNEIG-VETERANS - ORACLE CLOUD
echo ============================================================
echo.
if not exist "%SSH_KEY%" (
  echo ERROR: No trobo la clau SSH: "%SSH_KEY%"
  exit /b 1
)
if not exist "%LOCAL_SCRIPT%" (
  echo ERROR: No trobo l'script auxiliar: "%LOCAL_SCRIPT%"
  exit /b 1
)
where ssh >nul 2>&1 || (echo ERROR: SSH no esta disponible. & exit /b 1)
where scp >nul 2>&1 || (echo ERROR: SCP no esta disponible. & exit /b 1)

echo [1/3] Copiant l'script segur al servidor...
scp -q -i "%SSH_KEY%" -o BatchMode=yes -o ConnectTimeout=15 "%LOCAL_SCRIPT%" "%SSH_HOST%:%REMOTE_SCRIPT%"
if errorlevel 1 goto :error

echo [2/3] Actualitzant i comprovant el servei...
ssh -T -i "%SSH_KEY%" -o BatchMode=yes -o ConnectTimeout=15 "%SSH_HOST%" "bash '%REMOTE_SCRIPT%'; RESULT=$?; rm -f '%REMOTE_SCRIPT%'; exit $RESULT"
if errorlevel 1 goto :error

echo [3/3] FINALITZAT: actualitzacio correcta.
echo.
pause
exit /b 0

:error
echo.
echo ============================================================
echo ERROR: Actualitzacio no completada. Revisa el missatge anterior.
echo ============================================================
pause
exit /b 1
