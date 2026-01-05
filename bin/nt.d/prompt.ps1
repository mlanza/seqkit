#!/usr/bin/env pwsh

$prompt = $input | Out-String
$wikilinks = $prompt | nt wikilinks

$prompt
write-host "---"
$wikilinks | nt about
