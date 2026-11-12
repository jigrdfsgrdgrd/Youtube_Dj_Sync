$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\DJ Sync.lnk")
$ExePath = Join-Path $AppDir "DJ Sync.exe"
$BatPath = Join-Path $AppDir "start_dj_sync.bat"
$IconPath = Join-Path $AppDir "dj-sync.ico"

if (Test-Path $ExePath) {
    $Shortcut.TargetPath = $ExePath
} else {
    $Shortcut.TargetPath = "cmd.exe"
    $Shortcut.Arguments = "/c `"`"$BatPath`"`""
}
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Save()
Write-Host "Desktop-Verknuepfung 'DJ Sync' mit Logo erfolgreich erstellt!"
