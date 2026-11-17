@echo off
setlocal
set "HOST=ubuntu@competicio.masip.info"
set "KEY=%USERPROFILE%\.ssh\torneig-oracle.key"
set "DEST=C:\Backups\Torneig-Veterans"
title Copies de seguretat - Torneig Veterans
if not exist "%KEY%" (
    echo ERROR: No es troba la clau SSH: "%KEY%"
    goto error
)
if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%" goto error
echo Descarregant les copies de seguretat des d'Oracle Cloud...
scp -i "%KEY%" "%HOST%:/home/ubuntu/backups-mysql/backup-torneig-*.sql.gz" "%DEST%"
if errorlevel 1 goto error
echo.
echo Copies descarregades correctament a %DEST%
explorer "%DEST%"
pause
exit /b 0
:error
echo.
echo ERROR: No s'ha pogut completar la descarrega.
pause
exit /b 1
