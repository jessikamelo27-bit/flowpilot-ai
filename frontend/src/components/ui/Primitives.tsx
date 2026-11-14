import React from "react";
import { cn } from "../../lib/utils";
import type { RequestStateType, RiskLevelType } from "../../types/api";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-800/80 bg-[#11182E]/90 shadow-lg shadow-black/25 backdrop-blur-sm transition-all duration-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-slate-800/70 px-5 py-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-semibold tracking-tight text-slate-100", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "success" | "amber" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-950/50 border border-blue-500/40",
    secondary:
      "bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-950/50 border border-violet-500/40",
    outline:
      "bg-slate-900/70 hover:bg-slate-800 text-slate-200 border border-slate-700/80",
    danger:
      "bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-500/40",
    success:
      "bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-500/40",
    amber:
      "bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-500/40",
    ghost: "bg-transparent hover:bg-slate-800/60 text-slate-300",
  };

  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs rounded-lg",
    md: "px-3.5 py-2 text-xs font-medium rounded-lg",
    lg: "px-4 py-2.5 text-sm font-medium rounded-xl",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: RequestStateType | string }) {
  const styles: Record<string, string> = {
    CONCLUIDA: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    APROVADA: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    EXECUTADA: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    EM_PROCESSAMENTO: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    RECEBIDA: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    AGUARDANDO_APROVACAO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    PENDENTE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    AGUARDANDO_INFORMACOES: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    SOLICITAR_INFO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    REJEITADA: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    ERRO: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };

  const labels: Record<string, string> = {
    CONCLUIDA: "Concluída",
    APROVADA: "Aprovada",
    EXECUTADA: "Executada",
    EM_PROCESSAMENTO: "Em Processamento",
    RECEBIDA: "Recebida",
    AGUARDANDO_APROVACAO: "Aguardando Aprovação",
    PENDENTE: "Pendente",
    AGUARDANDO_INFORMACOES: "Aguardando Info",
    SOLICITAR_INFO: "Info Solicitada",
    REJEITADA: "Rejeitada",
    ERRO: "Erro / Bloqueada",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        styles[status] || "bg-slate-800 text-slate-300 border-slate-700"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status] || status}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevelType | string }) {
  const styles: Record<string, string> = {
    BAIXO: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    MEDIO: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    ALTO: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    CRITICO: "bg-rose-500/15 text-rose-400 border-rose-500/35 font-semibold",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        styles[risk] || "bg-slate-800 text-slate-400 border-slate-700"
      )}
    >
      {risk}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-3xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn">
      <div
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col rounded-2xl border border-slate-700/80 bg-[#0E1529] shadow-2xl shadow-black/60",
          maxWidth
        )}
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-slate-800/60 bg-[#11182E]/60 p-5",
        className
      )}
    >
      <div className="h-3 w-24 rounded bg-slate-800" />
      <div className="mt-3 h-7 w-16 rounded bg-slate-800" />
      <div className="mt-3 h-2.5 w-32 rounded bg-slate-800/70" />
    </div>
  );
}
