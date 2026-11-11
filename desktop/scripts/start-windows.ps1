param([string]$Executable,[string]$Project)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Executable missing: $Executable" }
$taskRunning = @(Get-Process -Name agentcv-desktop -ErrorAction SilentlyContinue)
if ($taskRunning.Count -gt 0) {
    throw 'SIDE is already running. Save and close the current window, then start version 0.16.9 again.'
}
$taskArguments = @()
if ($Project) {
    if (-not (Test-Path -LiteralPath $Project)) { throw "Project missing: $Project" }
    $taskArguments = @('"' + $Project + '"')
}
if ($taskArguments.Count) {
    Start-Process -FilePath $Executable -ArgumentList $taskArguments -WorkingDirectory (Split-Path -Parent $Executable)
} else {
    Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable)
}
