param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$jsRoot = Join-Path $ProjectRoot 'js'
$corePath = Join-Path $jsRoot 'gridnode-core.js'
$modulesDir = Join-Path $jsRoot 'modules'
$appPath = Join-Path $jsRoot 'gridnode-app.js'
$bundlePath = Join-Path $jsRoot 'gridnode-bundle.js'

# Pinned concatenation order for js/modules/ (single source of truth: js/modules/order.json)
$orderPath = Join-Path $modulesDir 'order.json'
$moduleFiles = Get-Content -LiteralPath $orderPath -Raw -Encoding UTF8 | ConvertFrom-Json

$core = Get-Content -LiteralPath $corePath -Raw -Encoding UTF8
$modulesSource = ($moduleFiles | ForEach-Object {
  $p = Join-Path $modulesDir $_
  if (-not (Test-Path -LiteralPath $p)) { throw "ERROR: Missing module file: $p" }
  Get-Content -LiteralPath $p -Raw -Encoding UTF8
}) -join ''
$app = Get-Content -LiteralPath $appPath -Raw -Encoding UTF8

$moduleExportNames = [regex]::Matches($modulesSource, '(?m)^export\s+(?:(?:async\s+)?function|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)') |
  ForEach-Object { $_.Groups[1].Value } |
  Select-Object -Unique

$core = $core -replace '(?m)^export\s+', ''
$modules = $modulesSource -replace "(?ms)^import\s*\{.*?\}\s*from\s*'\./gridnode-core\.js';\s*", ''
$modules = $modules -replace '(?m)^export\s+', ''
$app = $app -replace "(?ms)^import\s*\{.*?\}\s*from\s*'\./gridnode-core\.js';\s*", ''
$app = $app -replace "(?m)^import \* as modules from '\./gridnode-modules\.js';\s*", ''
$app = $app -replace "(?m)^export\s+", ''
$app = $app -replace "(?m)^const \$ = id => document\.getElementById\(id\);\s*", ''

$moduleMap = ($moduleExportNames | ForEach-Object { "${_}:${_}" }) -join ','
$header = '/* GRID//NODE stable classic delivery bundle. Source remains modular in gridnode-core.js, js/modules/*.js, and gridnode-app.js. */'
$bundle = @(
  $header
  $core.Trim()
  $modules.Trim()
  "window.GNModules=Object.freeze({$moduleMap});"
  'const modules=window.GNModules;'
  $app.Trim()
) -join "`r`n`r`n"

Set-Content -LiteralPath $bundlePath -Value $bundle -Encoding utf8
Write-Output "Built $bundlePath"

