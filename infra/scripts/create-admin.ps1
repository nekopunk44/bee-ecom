param([Parameter(Mandatory=$true)][string]$Email)
$securePassword = Read-Host 'Administrator password (12–256 characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $payload = @{email=$Email; password=$plainPassword} | ConvertTo-Json -Compress
    $payload | docker compose exec -T api bee-admin-create
    if ($LASTEXITCODE -ne 0) { throw 'Administrator creation failed' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainPassword = $null
    $payload = $null
}
