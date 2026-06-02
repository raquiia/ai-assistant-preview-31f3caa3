param(
  [int]$Port = 5173,
  [string]$Root = (Join-Path (Split-Path $PSScriptRoot -Parent) "preview")
)

$ErrorActionPreference = "Stop"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "MIGSO-PCUBED preview listening on http://127.0.0.1:$Port"

function Send-Response {
  param(
    [System.Net.Sockets.TcpClient]$Client,
    [int]$Status,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType
  )

  try {
    if (-not $Client.Connected) {
      return
    }
    $stream = $Client.GetStream()
    $header = "HTTP/1.1 $Status $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::UTF8.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($Body, 0, $Body.Length)
    $stream.Flush()
  } catch {
    # Browser probes can disconnect early; keep the preview server alive.
  } finally {
    try { $Client.Close() } catch {}
  }
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 2000
    $client.SendTimeout = 2000
    $stream = $client.GetStream()
    $buffer = New-Object byte[] 4096
    $read = $stream.Read($buffer, 0, $buffer.Length)
    $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $read)
    $firstLine = ($request -split "`r?`n")[0]
    $parts = $firstLine -split " "
    $path = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
    if ($path -eq "/" -or $path.StartsWith("/embed/chat")) {
      $path = "/index.html"
    }
    $path = [Uri]::UnescapeDataString(($path -split "\?")[0]).TrimStart("/")
    $safePath = $path -replace "[/\\]+", [IO.Path]::DirectorySeparatorChar
    $file = Join-Path $Root $safePath
    $fullRoot = [IO.Path]::GetFullPath($Root)
    $fullFile = [IO.Path]::GetFullPath($file)
    if (-not $fullFile.StartsWith($fullRoot)) {
      throw "Invalid path"
    }
    if (-not (Test-Path -LiteralPath $fullFile -PathType Leaf)) {
      $body = [Text.Encoding]::UTF8.GetBytes("Not found")
      Send-Response -Client $client -Status 404 -StatusText "Not Found" -Body $body -ContentType "text/plain; charset=utf-8"
      continue
    }
    $ext = [IO.Path]::GetExtension($fullFile).ToLowerInvariant()
    $contentType = switch ($ext) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "application/javascript; charset=utf-8" }
      ".png" { "image/png" }
      ".jpg" { "image/jpeg" }
      ".jpeg" { "image/jpeg" }
      default { "application/octet-stream" }
    }
    $bytes = [IO.File]::ReadAllBytes($fullFile)
    Send-Response -Client $client -Status 200 -StatusText "OK" -Body $bytes -ContentType $contentType
  } catch {
    if ($null -ne $client) {
      $body = [Text.Encoding]::UTF8.GetBytes("Server error")
      Send-Response -Client $client -Status 500 -StatusText "Server Error" -Body $body -ContentType "text/plain; charset=utf-8"
    }
  }
}
