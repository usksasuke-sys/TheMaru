# 同じWi-Fiの端末から、このフォルダのゲームをブラウザで開く。
param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
try {
  chcp 65001 | Out-Null
} catch {
}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "まんまる精度ゲーム (Wi-Fi)"

$Root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))

function Get-LanAddresses {
  $rows = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
      $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*"
    })
  $rows | Sort-Object @{
    Expression = {
      if ($_.InterfaceAlias -match "Wi-?Fi|WLAN|Wireless|ワイヤレス") { 0 } else { 1 }
    }
  }, InterfaceMetric, InterfaceAlias
}

# ブラウザは先に空の接続を開くことがある。1本ずつだとページの読み込みが止まるので、接続ごとに処理する。
$ServeClient = {
  param($client, $Root)

  function Get-ContentType([string]$path) {
    switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "text/javascript; charset=utf-8" }
      ".json" { "application/json; charset=utf-8" }
      ".svg" { "image/svg+xml" }
      ".png" { "image/png" }
      ".jpg" { "image/jpeg" }
      ".jpeg" { "image/jpeg" }
      ".gif" { "image/gif" }
      ".webp" { "image/webp" }
      ".ico" { "image/x-icon" }
      ".txt" { "text/plain; charset=utf-8" }
      ".toml" { "text/plain; charset=utf-8" }
      default { "application/octet-stream" }
    }
  }

  function Send-Bytes($stream, [int]$status, [string]$reason, [string]$contentType, [byte[]]$body) {
    if (-not $body) { $body = [byte[]]@() }
    $header = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($body.Length -gt 0) {
      $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
  }

  function Send-Text($stream, [int]$status, [string]$reason, [string]$text) {
    Send-Bytes $stream $status $reason "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes($text))
  }

  function Resolve-GameFile([string]$urlPath) {
    $relative = [System.Uri]::UnescapeDataString($urlPath)
    $query = $relative.IndexOf("?")
    if ($query -ge 0) { $relative = $relative.Substring(0, $query) }
    $relative = $relative.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }

    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    $prefix = $rootFull.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -and $full -ne $rootFull) {
      return $null
    }
    if (Test-Path -LiteralPath $full -PathType Container) {
      $full = Join-Path $full "index.html"
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return "" }
    return $full
  }

  $stream = $null
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 3000
    $buffer = New-Object byte[] 4096
    $memory = New-Object System.IO.MemoryStream
    while ($memory.Length -lt 65536) {
      $count = $stream.Read($buffer, 0, $buffer.Length)
      if ($count -le 0) { break }
      $memory.Write($buffer, 0, $count)
      $soFar = [System.Text.Encoding]::ASCII.GetString($memory.ToArray())
      if ($soFar.Contains("`r`n`r`n")) { break }
    }
    $request = [System.Text.Encoding]::ASCII.GetString($memory.ToArray())
    $line = ($request -split "`r`n", 2)[0]
    if ($line -notmatch "^(GET|HEAD)\s+(\S+)\s+HTTP/") {
      Send-Text $stream 400 "Bad Request" "リクエストを読めませんでした。"
      return
    }
    $file = Resolve-GameFile $Matches[2]
    if ($null -eq $file) {
      Send-Text $stream 403 "Forbidden" "このフォルダの外は開けません。"
      return
    }
    if ($file -eq "") {
      Send-Text $stream 404 "Not Found" "ファイルが見つかりません。"
      return
    }
    Send-Bytes $stream 200 "OK" (Get-ContentType $file) ([System.IO.File]::ReadAllBytes($file))
  } catch {
  } finally {
    if ($stream) { $stream.Dispose() }
    $client.Close()
  }
}

$listener = $null
$port = 8080
foreach ($candidate in 8080..8090) {
  $trial = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $candidate)
  try {
    $trial.Start()
    $listener = $trial
    $port = $candidate
    break
  } catch {
    $trial.Stop()
  }
}
if (-not $listener) {
  Write-Host "ポート 8080 から 8090 がすべて使用中です。" -ForegroundColor Red
  Read-Host "Enter で閉じます"
  exit 1
}

$addresses = @(Get-LanAddresses)
Write-Host ""
Write-Host "  まんまる精度ゲーム" -ForegroundColor White
Write-Host "  同じWi-Fiの端末から開けます" -ForegroundColor DarkGray
Write-Host ""
if ($addresses.Count -eq 0) {
  Write-Host "  Wi-Fiのアドレスが見つかりません。このPCでは次を開いてください。" -ForegroundColor Yellow
} else {
  Write-Host "  スマホやタブレットのブラウザに、次のアドレスを入力してください。" -ForegroundColor Cyan
  Write-Host ""
  foreach ($address in $addresses) {
    Write-Host "  http://$($address.IPAddress):$port/" -ForegroundColor Green
    Write-Host "    $($address.InterfaceAlias)" -ForegroundColor DarkGray
  }
}
Write-Host ""
Write-Host "  このPC:  http://localhost:$port/" -ForegroundColor Gray
Write-Host ""
Write-Host "  つながらないときは、Windowsのファイアウォールで" -ForegroundColor DarkYellow
Write-Host "  PowerShell のプライベートネットワークを許可してください。" -ForegroundColor DarkYellow
Write-Host "  終了は Ctrl+C です。" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
  Start-Process "http://localhost:$port/"
}

$pool = [runspacefactory]::CreateRunspacePool(1, 16)
$pool.Open()
$workers = New-Object System.Collections.Generic.List[object]

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $worker = [powershell]::Create()
    $worker.RunspacePool = $pool
    [void]$worker.AddScript($ServeClient).AddArgument($client).AddArgument($Root)
    $workers.Add([pscustomobject]@{
        Worker = $worker
        Handle = $worker.BeginInvoke()
      })
    for ($index = $workers.Count - 1; $index -ge 0; $index--) {
      if ($workers[$index].Handle.IsCompleted) {
        $workers[$index].Worker.Dispose()
        $workers.RemoveAt($index)
      }
    }
  }
} finally {
  $listener.Stop()
  foreach ($item in $workers) { $item.Worker.Dispose() }
  $pool.Close()
}
