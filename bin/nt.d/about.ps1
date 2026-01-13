#!/usr/bin/env pwsh
$topics = @($input) + @($args)
$body = $topics | nt seen | nt prereq | nt seen | nt page --less | nt tidy
$body
$mentioned = $body | nt wikilinks | nt seen
$mentioned | Where-Object { $_ -notin ($topics) } | sort | nt props tags situation -r situation --heading=2 | nt sep "# See Also"
