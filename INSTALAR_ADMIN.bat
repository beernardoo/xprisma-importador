@echo off
echo ================================================
echo   XPrisma — Configuracao de Rede e Auto-Inicio
echo ================================================
echo.

REM --- Firewall ---
echo [1/2] Abrindo porta 3456 no firewall...
netsh advfirewall firewall delete rule name="XPrisma-3456" >nul 2>&1
netsh advfirewall firewall add rule name="XPrisma-3456" dir=in action=allow protocol=TCP localport=3456
echo     Porta 3456 liberada.

REM --- Tarefa agendada para iniciar com Windows ---
echo [2/2] Criando tarefa de auto-inicio...
schtasks /delete /tn "XPrisma" /f >nul 2>&1
schtasks /create /tn "XPrisma" /tr "cmd.exe /c cd /d C:\Users\User\Projeto01 && pm2 start server.js --name xprisma 2>nul && pm2 save" /sc ONLOGON /rl HIGHEST /f
echo     Tarefa criada (inicia automaticamente ao fazer login).

echo.
echo ================================================
echo  CONCLUIDO!
echo  Acesse em qualquer dispositivo da rede:
echo  http://10.1.0.145:3456
echo ================================================
pause
