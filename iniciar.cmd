@echo off
chcp 65001 >nul
title Solucoes de IA (versao local)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e abra de novo. & pause & exit /b 1)
if not exist "node_modules\@anthropic-ai\sdk" (
  echo Instalando as dependencias pela primeira vez...
  call npm install --omit=dev --no-fund --no-audit || (pause & exit /b 1)
)
node server.js --abrir
pause
