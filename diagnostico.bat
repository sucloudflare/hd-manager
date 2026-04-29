@echo off
chcp 850 >nul
title HD Manager - Diagnostico
cd /d "%~dp0"

echo.
echo  HD Manager - Diagnostico
echo  ========================
echo.

echo [1] Node.js:
node --version 2>&1
if %ERRORLEVEL% neq 0 echo      NAO ENCONTRADO - Instale em nodejs.org

echo.
echo [2] npm:
npm.cmd --version 2>&1

echo.
echo [3] Electron instalado?
if exist "node_modules\electron\dist\electron.exe" (
    echo      SIM - encontrado em node_modules\electron\dist\
) else (
    echo      NAO - rode instalar-e-abrir.bat primeiro
)

echo.
echo [4] Testando PowerShell:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Write-Output 'PowerShell OK'"

echo.
echo [5] Discos detectados pelo PowerShell:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null} | Select-Object Name, @{N='FreeGB';E={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize"

echo.
echo [6] Tentando abrir Electron direto:
if exist "node_modules\electron\dist\electron.exe" (
    "node_modules\electron\dist\electron.exe" .
    echo Electron encerrou com codigo: %ERRORLEVEL%
) else (
    echo Electron nao instalado.
)

echo.
echo  Diagnostico concluido.
echo.
pause
