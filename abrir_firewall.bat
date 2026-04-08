@echo off
echo Abrindo porta 3456 no firewall...
netsh advfirewall firewall delete rule name="XPrisma-3456" >nul 2>&1
netsh advfirewall firewall add rule name="XPrisma-3456" dir=in action=allow protocol=TCP localport=3456
echo.
echo Pronto! Porta 3456 liberada na rede.
pause
