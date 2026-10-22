param([string]$Destino = (Join-Path $PSScriptRoot '..\..\runtime'))
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$runtimeDirectory = [IO.Path]::GetFullPath($Destino)
[IO.Directory]::CreateDirectory($runtimeDirectory) | Out-Null
$cacheDirectory = Join-Path $runtimeDirectory 'downloads'
[IO.Directory]::CreateDirectory($cacheDirectory) | Out-Null
$nodeVersion = '22.23.4'
$caddyVersion = '2.11.7'
$packages = @(
    @{ Name="node-v$nodeVersion-win-x64.zip"; Url="https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"; Checksums="https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt"; Kind='node' },
    @{ Name="caddy_${caddyVersion}_windows_amd64.zip"; Url="https://github.com/caddyserver/caddy/releases/download/v$caddyVersion/caddy_${caddyVersion}_windows_amd64.zip"; Checksums="https://github.com/caddyserver/caddy/releases/download/v$caddyVersion/caddy_${caddyVersion}_checksums.txt"; Kind='caddy' }
)
foreach ($package in $packages) {
    $archive = Join-Path $cacheDirectory $package.Name
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing -Uri $package.Url -OutFile $archive }
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri $package.Checksums).Content
    if ($checksums -is [byte[]]) { $checksums = [Text.Encoding]::UTF8.GetString($checksums) }
    $line = $checksums -split "`n" | Where-Object { $_.TrimEnd().EndsWith($package.Name) } | Select-Object -First 1
    if (-not $line) { throw "Checksum oficial não encontrado para $($package.Name)." }
    $expected = ($line.Trim() -split '\s+')[0].ToLowerInvariant()
    $algorithm = if ($expected.Length -eq 128) { 'SHA512' } elseif ($expected.Length -eq 64) { 'SHA256' } else { throw 'Formato de checksum oficial desconhecido.' }
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm $algorithm).Hash.ToLowerInvariant()
    if ($expected -ne $actual) { throw "Checksum inválido: $($package.Name). Não será executado." }
    $extractDirectory = Join-Path $cacheDirectory $package.Kind
    Expand-Archive -LiteralPath $archive -DestinationPath $extractDirectory -Force
    if ($package.Kind -eq 'node') {
        Copy-Item -LiteralPath (Join-Path $extractDirectory "node-v$nodeVersion-win-x64\node.exe") -Destination (Join-Path $runtimeDirectory 'node.exe') -Force
        Copy-Item -LiteralPath (Join-Path $extractDirectory "node-v$nodeVersion-win-x64\LICENSE") -Destination (Join-Path $runtimeDirectory 'LICENSE-Node.txt') -Force
    } else {
        Copy-Item -LiteralPath (Join-Path $extractDirectory 'caddy.exe') -Destination (Join-Path $runtimeDirectory 'caddy.exe') -Force
        if (Test-Path -LiteralPath (Join-Path $extractDirectory 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $extractDirectory 'LICENSE') -Destination (Join-Path $runtimeDirectory 'LICENSE-Caddy.txt') -Force }
    }
    Write-Host "$($package.Kind): $algorithm verificado."
}
