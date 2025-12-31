#!/usr/bin/env pwsh
$input |
  Select-String -Pattern '\[\[([^\]\r\n]+)\]\]' -AllMatches |
  ForEach-Object {
    $_.Matches | ForEach-Object { $_.Groups[1].Value }
  }
