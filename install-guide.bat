@echo off
echo ========================================
echo     MYSQL INSTALLATION GUIDE FOR WINDOWS
echo ========================================
echo.
echo CHOOSE ONE OPTION:
echo.
echo [1] XAMPP (EASIEST - Recommended)
echo     - Includes MySQL, Apache, PHP
echo     - No password by default
echo     - One-click start/stop
echo.
echo [2] MySQL Installer (Official)
echo     - Just MySQL
echo     - Need to remember password
echo     - More control
echo.
echo ========================================
echo.
set /p choice="Enter 1 or 2: "

if "%choice%"=="1" (
    echo Opening XAMPP download page...
    start https://www.apachefriends.org/download.html
    echo.
    echo Download: xampp-windows-x64-*.exe
    echo Install to: C:\xampp
    echo After installation:
    echo   1. Open XAMPP Control Panel
    echo   2. Click "Start" next to MySQL
    echo   3. Test with: node test-xampp.js
) else if "%choice%"=="2" (
    echo Opening MySQL download page...
    start https://dev.mysql.com/downloads/installer/
    echo.
    echo Download: mysql-installer-web-community-*.msi
    echo During installation:
    echo   1. Choose "Developer Default"
    echo   2. REMEMBER THE ROOT PASSWORD!
    echo   3. Test with: node test-mysql-installer.js
) else (
    echo Invalid choice
)

echo.
echo Press any key to exit...
pause > nul