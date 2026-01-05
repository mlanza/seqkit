#!/usr/bin/env pwsh

$prompt = $input | Out-String
$wikilinks = $prompt | nt wikilinks

$prompt
if ($wikilinks) {
  write-host "---"
  $wikilinks | nt prereq | nt seen | nt page --agent --heading=2
}

