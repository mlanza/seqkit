#!/usr/bin/env pwsh
nt prereq $args[0] | nt page --less "~tasks" --less "~links"
