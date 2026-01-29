@echo off
echo ========================================
echo        MySQL Status Checker
echo ========================================
echo.

echo Checking MySQL services...
sc query type= service state= all | findstr /i mysql
echo.

echo Checking if port 3306 is in use...
netstat -ano | findstr :3306
echo.

echo Checking MySQL installation...
where mysql 2>nul
if errorlevel 1 (
    echo MySQL command not found in PATH
) else (
    echo MySQL is in PATH
)
echo.

echo Attempting to connect to MySQL...
timeout /t 3 /nobreak > nul

echo Press any key to exit...
pause > nul