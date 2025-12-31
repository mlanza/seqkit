#!/usr/bin/env pwsh
nt page Skills --less "~tasks" --less "~links"
nt tags Skills | sort | nt props description | nt wikify
