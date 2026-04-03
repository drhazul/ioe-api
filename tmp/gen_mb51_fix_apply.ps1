$files = @(
  'mb51_fix_reid_plan_DF01811202450409.csv',
  'mb51_fix_reid_plan_DF06-20260330-VF-0032.csv'
)

$stmts = @()
foreach ($f in $files) {
  Get-Content $f | Where-Object { $_ -like 'COUNTER_BAD_DOCP;INSERT*' } | ForEach-Object {
    $idx = $_.IndexOf(';')
    if ($idx -ge 0) { $stmts += $_.Substring($idx + 1) }
  }
}

$script = @(
  'SET NOCOUNT ON;',
  'USE IOELOCAL;',
  'BEGIN TRY',
  'BEGIN TRAN;'
)
$script += $stmts
$script += @(
  'COMMIT TRAN;',
  'END TRY',
  'BEGIN CATCH',
  'IF @@TRANCOUNT>0 ROLLBACK;',
  'THROW;',
  'END CATCH',
  'GO'
)

$path = 'sql/mb51_fix_apply.sql'
$script | Set-Content $path -Encoding UTF8
Write-Output \"Wrote $($stmts.Count) statements to $path\"
