#!/usr/bin/env pwsh
$names = @($input) + @($args)
$names | nt prereq | nt seen | nt page --less | nt tidy
