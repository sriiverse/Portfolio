# Minimal static file server for SRIIVERSEAI — no installs required (uses .NET HttpListener)
param(
  [string]$Root = (Get-Location).Path,
  [int]$Port = 5500
)

Add-Type -AssemblyName System.Web

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "SRIIVERSEAI running at  http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Serving: $Root" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop.`n"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.pdf'  = 'application/pdf'
  '.txt'  = 'text/plain; charset=utf-8'
  '.map'  = 'application/json'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request.Url.LocalPath
    $req = [System.Uri]::UnescapeDataString($req)

    if ($req -eq '/' -or $req -eq '') { $req = '/index.html' }

    # strip query, normalize
    $rel = $req.TrimStart('/')
    $path = Join-Path $Root $rel

    if (Test-Path $path -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ctx.Response.ContentType = $ct
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.AddHeader('Cache-Control','no-cache')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close()
      Write-Host "  200  $req" -ForegroundColor Green
    } else {
      $ctx.Response.StatusCode = 404
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found: $req")
      $ctx.Response.OutputStream.Write($body, 0, $body.Length)
      $ctx.Response.Close()
      Write-Host "  404  $req" -ForegroundColor Red
    }
  }
}
finally {
  if ($listener) { $listener.Stop() }
}
