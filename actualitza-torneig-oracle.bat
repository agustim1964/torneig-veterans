@echo off
setlocal EnableExtensions

title Actualitzar torneig-veterans a Oracle Cloud

rem ============================================================
rem CONFIGURACIO
rem ============================================================
set "SSH_USER=ubuntu"
set "SSH_HOST=competicio.masip.info"
set "SSH_DIR=C:\Users\agust\OneDrive\Oracle\ssh"
set "REMOTE_DIR=/home/ubuntu/torneig-veterans"
set "PM2_APP=torneig-veterans"
set "WEB_URL=https://competicio.masip.info"

echo.
echo ============================================================
echo   ACTUALITZACIO TORNEIG-VETERANS - ORACLE CLOUD
echo ============================================================
echo.

rem ============================================================
rem LOCALITZAR CLAU PRIVADA
rem ============================================================
set "SSH_KEY="

for %%F in ("%SSH_DIR%\*.key") do (
    if exist "%%~fF" (
        set "SSH_KEY=%%~fF"
        goto :KEY_FOUND
    )
)

for %%F in ("%SSH_DIR%\*.pem") do (
    if exist "%%~fF" (
        set "SSH_KEY=%%~fF"
        goto :KEY_FOUND
    )
)

:KEY_FOUND
if not defined SSH_KEY (
    echo ERROR: No s'ha trobat cap clau privada .key o .pem a:
    echo        %SSH_DIR%
    echo.
    pause
    exit /b 1
)

echo Clau SSH:
echo   %SSH_KEY%
echo.
echo Servidor:
echo   %SSH_USER%@%SSH_HOST%
echo.

rem ============================================================
rem ACTUALITZACIO REMOTA
rem ============================================================
echo [1/3] Connectant per SSH i actualitzant el projecte...
echo.

ssh -o ConnectTimeout=15 -i "%SSH_KEY%" %SSH_USER%@%SSH_HOST% "cd %REMOTE_DIR% && echo '--- GIT STATUS ---' && git status --short && echo '--- GIT PULL ---' && git pull --ff-only && echo '--- NPM INSTALL ---' && npm install && echo '--- PM2 RESTART ---' && pm2 restart %PM2_APP% && pm2 save && echo '--- PM2 STATUS ---' && pm2 status && echo '--- ULTIMES LINIES DEL LOG ---' && pm2 logs %PM2_APP% --lines 20 --nostream"

if errorlevel 1 (
    echo.
    echo ============================================================
    echo ERROR: L'actualitzacio remota ha fallat.
    echo Revisa els missatges anteriors abans de continuar.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo.
echo [2/3] Actualitzacio remota completada correctament.
echo.

rem ============================================================
rem COMPROVACIO EXTERNA HTTPS
rem ============================================================
echo [3/3] Comprovant la web des d'aquest ordinador...
echo.

curl.exe -L -f -s -o NUL -w "Resposta HTTP final: %%{http_code}\n" "%WEB_URL%"

if errorlevel 1 (
    echo.
    echo ============================================================
    echo ATENCIO: El desplegament s'ha fet, pero la comprovacio HTTPS
    echo no ha respost correctament.
    echo Prova manualment:
    echo   %WEB_URL%
    echo ============================================================
    echo.
    pause
    exit /b 2
)

echo.
echo ============================================================
echo   ACTUALITZACIO COMPLETADA CORRECTAMENT
echo ============================================================
echo.
echo Web:
echo   %WEB_URL%
echo.
echo Pots tancar aquesta finestra.
echo.
pause

endlocal
