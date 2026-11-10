$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\DJ Sync Server.lnk")
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/c `"`"C:\Users\juliu\..gemini\antigravity\scratch\next-app\start_dj_sync.bat`"`""
$Shortcut.WorkingDirectory = "C:\Users\juliu\..gemini\antigravity\scratch\next-app"
$Shortcut.IconLocation = "imageres.dll,136"
$Shortcut.Save()
