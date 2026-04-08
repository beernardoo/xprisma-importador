@echo off
cd /d C:\Users\User\Projeto01
pm2 start server.js --name xprisma 2>nul
pm2 save
