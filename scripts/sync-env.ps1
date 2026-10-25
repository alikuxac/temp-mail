# Sync a .env file with its .env.example template.
#
# - Never overwrites an existing value in the target file.
# - Appends keys that exist in the example but not in the target.
# - Prints a summary; writes a backup before modifying a non-empty target.
#
# Usage:
#   pwsh -NoProfile -File scripts/sync-env.ps1 -Example apps/workers/.env.example -Target apps/workers/.env
#   pwsh -NoProfile -File scripts/sync-env.ps1            # both apps/workers and apps/telegram-mini-app

[CmdletBinding()]
param(
	[string]$Example,
	[string]$Target
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function ConvertTo-EnvEntry {
	param([string]$Line)

	if ([string]::IsNullOrWhiteSpace($Line)) { return $null }
	if ($Line.TrimStart().StartsWith("#")) { return [pscustomobject]@{ Kind = "comment"; Key = $null; Line = $Line } }
	if ($Line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
		return [pscustomobject]@{ Kind = "key"; Key = $Matches[1]; Line = $Line }
	}
	return [pscustomobject]@{ Kind = "other"; Key = $null; Line = $Line }
}

function Sync-EnvFile {
	param([string]$ExamplePath, [string]$TargetPath)

	if (-not (Test-Path -LiteralPath $ExamplePath)) { throw "Example file not found: $ExamplePath" }

	$exampleText = [System.IO.File]::ReadAllText($ExamplePath)
	$targetDir = Split-Path -Parent $TargetPath
	if ($targetDir -and -not (Test-Path -LiteralPath $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }

	$targetText = if (Test-Path -LiteralPath $TargetPath) { [System.IO.File]::ReadAllText($TargetPath) } else { "" }

	# Keys already defined in the target (values stay untouched).
	$existingKeys = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
	foreach ($line in ($targetText -split "`r?`n")) {
		$entry = ConvertTo-EnvEntry -Line $line
		if ($entry -and $entry.Kind -eq "key") { [void]$existingKeys.Add($entry.Key) }
	}

	# Keys offered by the example, in order, with their comments.
	$exampleLines = $exampleText -split "`r?`n"
	$append = New-Object System.Collections.Generic.List[string]
	$pendingComments = New-Object System.Collections.Generic.List[string]
	$exampleKeys = New-Object System.Collections.Generic.List[string]

	foreach ($line in $exampleLines) {
		$entry = ConvertTo-EnvEntry -Line $line
		if (-not $entry) { continue }

		if ($entry.Kind -eq "comment") { $pendingComments.Add($entry.Line); continue }

		if ($entry.Kind -eq "key") {
			$exampleKeys.Add($entry.Key)
			if (-not $existingKeys.Contains($entry.Key)) {
				foreach ($pending in $pendingComments) { $append.Add($pending) }
				$append.Add($entry.Line)
				[void]$existingKeys.Add($entry.Key)
			}
			$pendingComments.Clear()
			continue
		}

		$pendingComments.Clear()
	}

	$addedKeys = New-Object System.Collections.Generic.List[string]
	for ($i = 0; $i -lt $append.Count; $i++) {
		if ($append[$i] -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $addedKeys.Add($Matches[1]) }
	}

	Write-Host ""
	Write-Host "=== $TargetPath"

	if ($exampleKeys.Count -eq 0) {
		Write-Host "  example has no keys, nothing to do"
		return
	}

	if ($addedKeys.Count -eq 0) {
		Write-Host "  up to date ($($exampleKeys.Count) keys, none missing)"
		return
	}

	if (-not [string]::IsNullOrWhiteSpace($targetText)) {
		$backup = "$TargetPath.bak"
		[System.IO.File]::WriteAllText($backup, $targetText)
		Write-Host "  backup written: $backup"
	}

	$builder = New-Object System.Text.StringBuilder
	if (-not [string]::IsNullOrWhiteSpace($targetText)) {
		$builder.Append($targetText.TrimEnd("`r", "`n"))
		$builder.Append("`r`n")
	}
	if ($addedKeys.Count -gt 0) {
		if (-not [string]::IsNullOrWhiteSpace($targetText)) { $builder.Append("`r`n") }
		$builder.Append("# --- added by sync-env.ps1 (fill these in) ---")
		$builder.Append("`r`n")
		$builder.Append(($append -join "`r`n"))
		$builder.Append("`r`n")
	}

	[System.IO.File]::WriteAllText($TargetPath, $builder.ToString())
	Write-Host "  appended $($addedKeys.Count) key(s): $($addedKeys -join ', ')"
}

if ($Example -and $Target) {
	Sync-EnvFile -ExamplePath (Join-Path $root $Example) -TargetPath (Join-Path $root $Target)
} elseif ($Example -or $Target) {
	throw "Pass both -Example and -Target, or neither."
} else {
	Sync-EnvFile -ExamplePath (Join-Path $root "apps/workers/.env.example") -TargetPath (Join-Path $root "apps/workers/.env")
	Sync-EnvFile -ExamplePath (Join-Path $root "apps/telegram-mini-app/.env.example") -TargetPath (Join-Path $root "apps/telegram-mini-app/.env")
}

Write-Host ""