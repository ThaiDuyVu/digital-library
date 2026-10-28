param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$MongoUri = 'mongodb://admin:admin123@localhost:27017/?authSource=admin',
    [ValidateRange(1,15)][int]$RedisDatabase = 15,
    [string]$Output,
    [string]$TestSelector = 'DatRedisIntegrationTest',
    [switch]$ReviewTests
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot/../..").Path
if (-not (Test-Path -LiteralPath "$JavaHome/bin/java.exe")) { throw 'Pass -JavaHome pointing to an existing JDK.' }
$runId = (Get-Date -Format 'yyyyMMddHHmmss') + '_' + ([guid]::NewGuid().ToString('N').Substring(0,8))
$container = 'dl_redis'
$mongoDatabase = 'digital_library_dat_acceptance_' + $runId
if (-not $Output) { $Output = "$repoRoot/output/acceptance/$runId" }
$outputPath = [IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $outputPath) { throw 'Use a new output directory to preserve prior evidence.' }
New-Item -ItemType Directory -Path $outputPath | Out-Null
# Reuse the project's Redis; DB0 belongs to the app and is never used for acceptance.
$keyCount = & docker exec $container redis-cli -n $RedisDatabase DBSIZE
if ($LASTEXITCODE -ne 0) { throw 'Start the digital-library Compose Redis before acceptance.' }
if (($keyCount | Out-String).Trim() -ne '0') {
    throw "Redis DB$RedisDatabase is not empty. Select another empty -RedisDatabase (1..15); do not flush existing data."
}
$boundPort = (& docker inspect $container --format '{{(index (index .NetworkSettings.Ports "6379/tcp") 0).HostPort}}').Trim()
if ($LASTEXITCODE -ne 0 -or $boundPort -notmatch '^\d+$') { throw 'Could not read Compose Redis port.' }
$uri = [UriBuilder]$MongoUri
$uri.Path = $mongoDatabase
$settings = @{
    JAVA_HOME = $JavaHome
    MONGO_URI = $uri.Uri.AbsoluteUri
    REDIS_URL = "redis://localhost:$boundPort/$RedisDatabase"
    DAT_INTEGRATION_TESTS = 'true'
    DAT_ACCEPTANCE_OUTPUT = $outputPath
    DAT_REVIEW_TESTS = $(if ($ReviewTests) { 'true' } else { 'false' })
}
$metadata = @{
    time = (Get-Date).ToString('o')
    baseCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
    mongoDatabase = $mongoDatabase
    redisContainer = $container
    redisEndpoint = "localhost:$boundPort/$RedisDatabase"
    sourceSha256 = (Get-FileHash -Algorithm SHA256 "$repoRoot/backend/src/test/java/vn/edu/huit/digitallibrary/reading/DatRedisIntegrationTest.java").Hash
    command = "mvnw.cmd -B -Dtest=$TestSelector test"
    dataPolicy = 'Fresh Mongo database; empty nonzero logical DB in Compose Redis; preserve existing data, no extra containers or flush'
}
$metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputPath 'environment.json')
Get-ChildItem "$repoRoot/backend/src/main/java" -Recurse -Filter *.java | ForEach-Object {
    @{path=$_.FullName.Substring($repoRoot.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $outputPath 'production-checksums.json')
$previous = @{}
foreach ($key in $settings.Keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key,'Process') }
try {
    foreach ($key in $settings.Keys) { [Environment]::SetEnvironmentVariable($key,$settings[$key],'Process') }
    Push-Location "$repoRoot/backend"
    try {
        & .\mvnw.cmd -B "-Dtest=$TestSelector" test *> (Join-Path $outputPath 'test.log')
        $testExit = $LASTEXITCODE
        Get-Content -LiteralPath (Join-Path $outputPath 'test.log') -Tail 16
        if ($testExit -ne 0) { throw "Acceptance failed (exit $testExit); data kept for diagnosis." }
        Write-Output "Evidence: $outputPath"
        Write-Output "Shared Redis: $container (localhost:$boundPort/DB$RedisDatabase); Mongo database: $mongoDatabase"
    } finally { Pop-Location }
} finally {
    foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
}
