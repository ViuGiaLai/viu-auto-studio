@echo off
title Viu Auto Studio - Dev Server
echo ==================================================
echo Starting Viu Auto Studio Desktop in Dev Mode...
echo ==================================================
cd /d "%~dp0\desktop"
pnpm dev
