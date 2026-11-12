$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\DJ Sync.lnk")
$ExePath = Join-Path $RootDir "DJ Sync.exe"
$IconPath = Join-Path $RootDir "dj-sync.ico"

$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $RootDir
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Save()
Write-Host "Desktop-Verknuepfung 'DJ Sync' mit Logo erfolgreich erstellt!"

