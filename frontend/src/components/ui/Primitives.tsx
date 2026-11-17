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
        "rounded-lg border border-[#E1E5EA] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(32,36,43,0.04)] transition-colors duration-150",
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
        "flex items-center justify-between border-b border-[#E1E5EA] px-4 py-3",
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
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-[#20242B]",
        className
      )}
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
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "danger"
    | "success"
    | "amber"
    | "ghost";
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
      "bg-[#2457C5] hover:bg-[#1D48A6] text-white border border-[#2457C5]",
    secondary:
      "bg-[#EAF0FC] hover:bg-[#DCE7FA] text-[#2457C5] border border-[#C5D6F7]",
    outline:
      "bg-[#FFFFFF] hover:bg-[#F4F5F7] text-[#20242B] border border-[#E1E5EA]",
    danger:
      "bg-[#C44F4F] hover:bg-[#AD3E3E] text-white border border-[#C44F4F]",
    success:
      "bg-[#24845A] hover:bg-[#1C6B48] text-white border border-[#24845A]",
    amber:
      "bg-[#B98220] hover:bg-[#9C6D19] text-white border border-[#B98220]",
    ghost: "bg-transparent hover:bg-[#F4F5F7] text-[#707783] hover:text-[#20242B]",
  };

  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs rounded-md",
    md: "px-3 py-1.5 text-xs font-medium rounded-md",
    lg: "px-4 py-2 text-sm font-medium rounded-md",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none",
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
    CONCLUIDA: "bg-[#24845A]/10 text-[#24845A] border-[#24845A]/30",
    APROVADA: "bg-[#24845A]/10 text-[#24845A] border-[#24845A]/30",
    EXECUTADA: "bg-[#EAF0FC] text-[#2457C5] border-[#2457C5]/30",
    EM_PROCESSAMENTO: "bg-[#EAF0FC] text-[#2457C5] border-[#2457C5]/30",
    RECEBIDA: "bg-[#F4F5F7] text-[#707783] border-[#E1E5EA]",
    AGUARDANDO_APROVACAO: "bg-[#B98220]/10 text-[#B98220] border-[#B98220]/30",
    PENDENTE: "bg-[#B98220]/10 text-[#B98220] border-[#B98220]/30",
    AGUARDANDO_INFORMACOES: "bg-[#B98220]/10 text-[#B98220] border-[#B98220]/30",
    SOLICITAR_INFO: "bg-[#B98220]/10 text-[#B98220] border-[#B98220]/30",
    REJEITADA: "bg-[#C44F4F]/10 text-[#C44F4F] border-[#C44F4F]/30",
    ERRO: "bg-[#C44F4F]/10 text-[#C44F4F] border-[#C44F4F]/30",
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
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        styles[status] || "bg-[#F4F5F7] text-[#707783] border-[#E1E5EA]"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status] || status}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevelType | string }) {
  const styles: Record<string, string> = {
    BAIXO: "bg-[#24845A]/10 text-[#24845A] border-[#24845A]/25",
    MEDIO: "bg-[#EAF0FC] text-[#2457C5] border-[#2457C5]/25",
    ALTO: "bg-[#B98220]/10 text-[#B98220] border-[#B98220]/30",
    CRITICO: "bg-[#C44F4F]/12 text-[#C44F4F] border-[#C44F4F]/35 font-semibold",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        styles[risk] || "bg-[#F4F5F7] text-[#707783] border-[#E1E5EA]"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20242B]/40 p-4 backdrop-blur-[1px]">
      <div
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col rounded-lg border border-[#E1E5EA] bg-[#FFFFFF] shadow-xl",
          maxWidth
        )}
      >
        <div className="flex items-start justify-between border-b border-[#E1E5EA] px-5 py-3.5 bg-[#F4F5F7]/50">
          <div>
            <h2 className="text-sm font-semibold text-[#20242B]">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-[#707783]">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#707783] hover:bg-[#E1E5EA]/60 hover:text-[#20242B]"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg border border-[#E1E5EA] bg-[#FFFFFF] p-4",
        className
      )}
    >
      <div className="h-3 w-24 rounded bg-[#E1E5EA]" />
      <div className="mt-2.5 h-6 w-16 rounded bg-[#E1E5EA]" />
      <div className="mt-2.5 h-2.5 w-32 rounded bg-[#F4F5F7]" />
    </div>
  );
}
