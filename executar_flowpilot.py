"""
Launcher Executável do FlowPilot AI (`executar_flowpilot.py`).

Inicia automaticamente:
1. O servidor Backend FastAPI (`http://127.0.0.1:8000`) que também serve o build de produção do React.
2. O servidor de desenvolvimento Frontend Vite (`http://localhost:5173`) se o Node/npm estiver disponível.
3. Abre automaticamente o navegador padrão na nova interface SaaS em React.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def wait_for_port(port: int, host: str = "127.0.0.1", timeout_sec: float = 20.0) -> bool:
    start = time.time()
    while time.time() - start < timeout_sec:
        if is_port_in_use(port, host):
            return True
        time.sleep(0.4)
    return False


def main() -> None:
    print("=" * 72)
    print("  FLOWPILOT AI — ENTERPRISE AGENTIC OPERATIONS PLATFORM (v2.0 SaaS)")
    print("=" * 72)

    processes: list[subprocess.Popen] = []

    try:
        # 1. Inicia o Backend FastAPI na porta 8000 (se ainda não estiver rodando)
        if is_port_in_use(8000):
            print("[OK] Backend FastAPI já está em execução em http://127.0.0.1:8000")
        else:
            print("[1/2] Iniciando Backend Python (FastAPI + 5 Agentes + SQLite) na porta 8000...")
            backend_proc = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "api.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                ],
                cwd=str(ROOT_DIR),
            )
            processes.append(backend_proc)
            wait_for_port(8000, timeout_sec=15.0)

        # 2. Inicia o Frontend React Vite na porta 5173 (ou usa a porta 8000 unificada)
        target_url = "http://127.0.0.1:8000"
        npm_cmd = shutil.which("npm")

        if is_port_in_use(5173):
            print("[OK] Frontend React (Vite) já está em execução em http://localhost:5173")
            target_url = "http://localhost:5173"
        elif npm_cmd and (FRONTEND_DIR / "node_modules").exists():
            print("[2/2] Iniciando Frontend React + TypeScript (Vite) na porta 5173...")
            frontend_proc = subprocess.Popen(
                [npm_cmd, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
                cwd=str(FRONTEND_DIR),
            )
            processes.append(frontend_proc)
            if wait_for_port(5173, timeout_sec=15.0):
                target_url = "http://localhost:5173"

        print("-" * 72)
        print(f"  -> Interface SaaS React: {target_url}")
        print("  -> Interface Unificada:  http://127.0.0.1:8000")
        print("  -> Documentação Swagger: http://127.0.0.1:8000/docs")
        print("-" * 72)
        print("Abrindo navegador automaticamente... (Pressione Ctrl+C para encerrar)")

        webbrowser.open(target_url)

        while True:
            time.sleep(1.0)
            for p in processes:
                if p.poll() is not None:
                    print("\n[AVISO] Um dos processos foi encerrado.")
                    return

    except KeyboardInterrupt:
        print("\nEncerrando servidores do FlowPilot AI...")
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()


if __name__ == "__main__":
    main()
