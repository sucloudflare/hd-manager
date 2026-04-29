@echo off
chcp 850 >nul
title HD Manager
cd /d "%~dp0"

echo.
echo  HD Manager v2.1
echo  ===============
echo.

echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERRO: Node.js nao encontrado!
    echo Instale em: https://nodejs.org
    pause
    exit /b 1
)
for /f %%v in ('node --version') do echo      Node.js %%v OK

echo.
echo [2/4] Configurando PowerShell...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" >nul 2>&1
echo      OK

echo.
echo [3/4] Instalando dependencias...
if exist "node_modules\electron\dist\electron.exe" (
    echo      Ja instalado, pulando...
    goto INICIAR
)
echo      Aguarde, pode demorar alguns minutos...
echo.
npm.cmd install 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERRO: npm install falhou!
    pause
    exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
    echo.
    echo ERRO: Electron nao foi instalado.
    pause
    exit /b 1
)

:INICIAR
echo.
echo [4/4] Abrindo HD Manager...
echo      (uma janela de DevTools vai abrir junto - e normal para debug)
echo.
node_modules\electron\dist\electron.exe . > erro.log 2>&1
echo.
echo App encerrou. Codigo: %ERRORLEVEL%
if exist erro.log (
    echo.
    echo --- Conteudo do log de erro ---
    type erro.log
    echo --- Fim do log ---
)
echo.
pause
