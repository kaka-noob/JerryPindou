@rem 本文件构建 Pindo 独立应用并安装到连接的手机。
@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm run android
if errorlevel 1 pause
