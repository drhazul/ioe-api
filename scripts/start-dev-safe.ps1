$ErrorActionPreference = 'Stop'

$ports = @(3000, 8081)
$workspaceHint = 'ioe-api'

foreach ($port in $ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }

    $name = ''
    if ($null -ne $proc.Name) { $name = [string]$proc.Name }
    $name = $name.ToLowerInvariant()

    $cmd = ''
    if ($null -ne $proc.CommandLine) { $cmd = [string]$proc.CommandLine }
    $cmdLower = $cmd.ToLowerInvariant()

    $isProjectNode = $name -eq 'node.exe' -and $cmdLower.Contains($workspaceHint)

    if ($isProjectNode) {
      Write-Host "[safe-start] Liberando puerto ${port}: PID=$($proc.ProcessId) $($proc.Name)"
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 300
    } else {
      Write-Warning "[safe-start] Puerto $port en uso por proceso externo (PID=$($proc.ProcessId), Name=$($proc.Name)). No se detiene."
    }
  }
}

Write-Host "[safe-start] Iniciando API en modo watch..."
npx nest start --watch
