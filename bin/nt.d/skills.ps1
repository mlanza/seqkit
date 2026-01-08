#!/usr/bin/env pwsh
nt page Skills --less
nt tags Skills | sort | nt props description | nt wikify
