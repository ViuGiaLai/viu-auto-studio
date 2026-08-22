$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $scriptDir "desktop\src\pages\project-editor-page.tsx"
Write-Host "Target: $target"
