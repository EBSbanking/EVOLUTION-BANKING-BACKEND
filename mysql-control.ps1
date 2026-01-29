# MySQL Control Script for Windows
param(
    [string]$Action = "status"
)

$ServiceName = "MySQL"

switch ($Action.ToLower()) {
    "start" {
        Write-Host "Starting MySQL..." -ForegroundColor Yellow
        Start-Service -Name $ServiceName
        Write-Host "✅ MySQL started" -ForegroundColor Green
    }
    "stop" {
        Write-Host "Stopping MySQL..." -ForegroundColor Yellow
        Stop-Service -Name $ServiceName
        Write-Host "✅ MySQL stopped" -ForegroundColor Green
    }
    "restart" {
        Write-Host "Restarting MySQL..." -ForegroundColor Yellow
        Restart-Service -Name $ServiceName
        Write-Host "✅ MySQL restarted" -ForegroundColor Green
    }
    "status" {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($service) {
            Write-Host "MySQL Status:" -ForegroundColor Cyan
            Write-Host "  Name: $($service.Name)"
            Write-Host "  Status: $($service.Status)"
            Write-Host "  Startup Type: $($service.StartType)"
        } else {
            Write-Host "❌ MySQL service not found" -ForegroundColor Red
            Write-Host "Install MySQL from: https://dev.mysql.com/downloads/installer/" -ForegroundColor Yellow
        }
    }
    "test" {
        Write-Host "Testing MySQL connection..." -ForegroundColor Yellow
        try {
            $result = Test-NetConnection -ComputerName localhost -Port 3306
            if ($result.TcpTestSucceeded) {
                Write-Host "✅ Port 3306 is open" -ForegroundColor Green
            } else {
                Write-Host "❌ Port 3306 is closed" -ForegroundColor Red
            }
        } catch {
            Write-Host "❌ Test failed: $_" -ForegroundColor Red
        }
    }
    default {
        Write-Host "Usage: .\mysql-control.ps1 [start|stop|restart|status|test]" -ForegroundColor Cyan
    }
}