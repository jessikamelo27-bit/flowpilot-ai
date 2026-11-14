@echo off
chcp 65001 >nul
title FlowPilot AI - Enterprise Agentic Operations Platform (SaaS React + FastAPI)
cd /d "%~dp0"
echo ============================================================================
echo   FLOWPILOT AI - INICIANDO PLATAFORMA SAAS (REACT + TYPESCRIPT + FASTAPI)
echo ============================================================================
python executar_flowpilot.py
pause
