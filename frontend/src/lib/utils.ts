import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export function formatDateTimeBR(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(dt);
  } catch {
    return isoString;
  }
}

export function formatShortDateBR(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return isoString;
  }
}
