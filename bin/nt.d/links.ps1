#!/usr/bin/env pwsh
$input |
  Select-String -Pattern 'https?:\/\/\S+|\[[^\]\r\n]+\]\(\s*https?:\/\/[^\s)]+(?:\s+"[^"\r\n]*")?\s*\)' -AllMatches |
  ForEach-Object {
    foreach ($m in $_.Matches) {
      if ($m.Value -match '^\[([^\]]+)\]\((https?:\/\/[^\s)]+)') {
        "$($Matches[2]) - $($Matches[1])"
      } else {
        $m.Value
      }
    }
  }
