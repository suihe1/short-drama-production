$ErrorActionPreference = 'Stop'

$secret = Read-Host 'Paste the CompShare API key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if (-not $plain.StartsWith('sk-ml-')) {
        throw 'The key does not look like a CompShare sk-ml- API key.'
    }
    $keyDir = Join-Path $env:USERPROFILE '.codex\secrets'
    $keyFile = Join-Path $keyDir 'compshare-h3.key'
    New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
    [IO.File]::WriteAllText($keyFile, $plain, [Text.UTF8Encoding]::new($false))
    Write-Host "Saved CompShare H3 API key to $keyFile"
}
finally {
    if ($ptr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
    $plain = $null
}
