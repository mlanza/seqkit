#!/usr/bin/env pwsh

$prompt = @($args) + @($input) | Out-String
$wikilinks = $prompt | nt commented | nt wikilinks | nt prereq

$prompt
if ($LASTEXITCODE -eq 0) {
  if ($wikilinks) {
    write-host "---"
    $copy = $wikilinks | nt seen | nt page --less --heading=2 | nt tidy
    $copy
    write-host "---"
    $copy | nt wikilinks | nt seen | nt props -r description -u description --heading=2
  }
} else {
  $code = $LASTEXITCODE
  Write-Host "⚠️ Wikilink expansion is not enabled."
  exit $code
}
