$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut("C:\Users\Jxri\Desktop\Stockman.lnk")
$Shortcut.TargetPath = "C:\Users\Jxri\Stockman\start.bat"
$Shortcut.WorkingDirectory = "C:\Users\Jxri\Stockman"
$Shortcut.Description = "Stockman - Personal Portfolio Tracker"
$Shortcut.Save()
Write-Host "Desktop shortcut created."
