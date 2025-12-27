#!/usr/bin/env pwsh
param(
  [Parameter(ValueFromRemainingArguments)]
  [int[]]$Offset = @(0)
)

foreach ($i in $Offset) {
  (Get-Date).AddDays($i).ToString('yyyy-MM-dd')
}
