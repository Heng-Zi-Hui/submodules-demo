$scriptPath = Join-Path $PSScriptRoot 'cli.js'
& node $scriptPath @args
exit $LASTEXITCODE
