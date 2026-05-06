$ErrorActionPreference = 'Stop'

$ports = @(3001, 8081)
$workspaceHint = 'ioe-api'

foreach ($port in $ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }

    $name = ($proc.Name ?? '').ToLowerInvariant()
    $cmd = ($proc.CommandLine ?? '')
    $isProjectNode = $name -eq 'node.exe' -and $cmd.ToLowerInvariant().Contains($workspaceHint)

    if ($isProjectNode) {
      Write-Host "[safe-start] Liberando puerto $port: PID=$($proc.ProcessId) $($proc.Name)"
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 300
    } else {
      Write-Warning "[safe-start] Puerto $port en uso por proceso externo (PID=$($proc.ProcessId), Name=$($proc.Name)). No se detiene."
    }
  }
}

Write-Host "[safe-start] Iniciando API en modo watch..."
npx nest start --watch

