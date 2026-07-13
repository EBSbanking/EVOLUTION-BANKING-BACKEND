# zip-plugins.ps1
Write-Host "📦 Zipping plugins..." -ForegroundColor Cyan

# Zip AML Plugin
if (Test-Path "plugins/aml-plugin") {
    Compress-Archive -Path "plugins/aml-plugin\*" -DestinationPath "aml-plugin.zip" -Force
    Write-Host "✅ Created aml-plugin.zip" -ForegroundColor Green
} else {
    Write-Host "❌ aml-plugin folder not found" -ForegroundColor Red
}

# Zip Paystack Plugin
if (Test-Path "plugins/paystack-plugin") {
    Compress-Archive -Path "plugins/paystack-plugin\*" -DestinationPath "paystack-plugin.zip" -Force
    Write-Host "✅ Created paystack-plugin.zip" -ForegroundColor Green
} else {
    Write-Host "❌ paystack-plugin folder not found" -ForegroundColor Red
}

Write-Host "`n✅ Done! Zip files created:" -ForegroundColor Green
Get-ChildItem *.zip | Select-Object Name, Length