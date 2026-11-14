import type {
  AgentTelemetry,
  ApprovalRecord,
  DashboardResponse,
  EvaluationStatusResponse,
  FullRequestTrace,
  HealthStatus,
  PolicyRuleRecord,
  RequestItem,
  SystemSettingsResponse,
} from "../types/api";

const API_BASE = "/api";

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let errorDetail = `Erro HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) {
        errorDetail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  return res.json() as Promise<T>;
}

export const flowpilotApi = {
  getHealth: () => requestJson<HealthStatus>("/health"),

  getDashboard: (manualMinutes?: number, reviewMinutes?: number) => {
    const params = new URLSearchParams();
    if (manualMinutes !== undefined) params.set("manual_minutes", String(manualMinutes));
    if (reviewMinutes !== undefined) params.set("review_minutes", String(reviewMinutes));
    const q = params.toString();
    return requestJson<DashboardResponse>(`/dashboard${q ? `?${q}` : ""}`);
  },

  updateImpactParams: (payload: {
    manual_minutes_per_request: number;
    human_review_minutes: number;
  }) =>
    requestJson<DashboardResponse>("/dashboard/impact-params", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  listRequests: (filters?: {
    category?: string;
    status?: string;
    risk_level?: string;
    search?: string;
    period_days?: number;
    include_demo?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters?.category && filters.category !== "TODAS")
      params.set("category", filters.category);
    if (filters?.status && filters.status !== "TODOS")
      params.set("status", filters.status);
    if (filters?.risk_level && filters.risk_level !== "TODOS")
      params.set("risk_level", filters.risk_level);
    if (filters?.search?.trim()) params.set("search", filters.search.trim());
    if (filters?.period_days) params.set("period_days", String(filters.period_days));
    if (filters?.include_demo !== undefined)
      params.set("include_demo", String(filters.include_demo));
    const q = params.toString();
    return requestJson<{ total: number; items: RequestItem[] }>(
      `/requests${q ? `?${q}` : ""}`
    );
  },

  createRequest: (payload: {
    title: string;
    requester_name: string;
    requester_department: string;
    raw_text: string;
    form_data: Record<string, any>;
    source: string;
  }) =>
    requestJson<FullRequestTrace>("/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getRequestDetail: (requestId: string) =>
    requestJson<FullRequestTrace>(`/requests/${encodeURIComponent(requestId)}`),

  complementRequest: (
    requestId: string,
    payload: {
      additional_text: string;
      additional_form_data: Record<string, any>;
      actor: string;
    }
  ) =>
    requestJson<FullRequestTrace>(
      `/requests/${encodeURIComponent(requestId)}/complement`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  listAgents: () => requestJson<{ agents: AgentTelemetry[] }>("/agents"),

  listApprovals: (status?: string) => {
    const q = status && status !== "TODOS" ? `?status=${encodeURIComponent(status)}` : "";
    return requestJson<{
      total: number;
      pending_count: number;
      decided_count: number;
      pending: ApprovalRecord[];
      history: ApprovalRecord[];
    }>(`/approvals${q}`);
  },

  decideApproval: (
    approvalId: string,
    payload: {
      decision: "APROVADA" | "REJEITADA" | "SOLICITAR_INFO";
      reviewer_name: string;
      justification: string;
    }
  ) =>
    requestJson<FullRequestTrace>(
      `/approvals/${encodeURIComponent(approvalId)}/decide`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  listPolicies: () => requestJson<{ rules: PolicyRuleRecord[] }>("/policies"),

  updatePolicy: (
    ruleCode: string,
    payload: {
      parameter_value: number;
      is_active: boolean;
      actor: string;
    }
  ) =>
    requestJson<{ updated: boolean; rules: PolicyRuleRecord[] }>(
      `/policies/${encodeURIComponent(ruleCode)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ),

  getEvaluation: () => requestJson<EvaluationStatusResponse>("/evaluation"),

  runEvaluation: () =>
    requestJson<EvaluationStatusResponse>("/evaluation/run", {
      method: "POST",
    }),

  getSettings: () => requestJson<SystemSettingsResponse>("/settings"),

  updateLLMSettings: (payload: {
    operation_mode: "LOCAL" | "LLM";
    llm_provider: "openai" | "gemini" | "compatible";
    llm_model: string;
    api_key?: string;
    clear_api_key?: boolean;
  }) =>
    requestJson<SystemSettingsResponse>("/settings/llm", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  loadDemoData: () =>
    requestJson<{ status: string; loaded_count: number }>("/demo/load", {
      method: "POST",
    }),

  clearDemoData: () =>
    requestJson<{ status: string; removed_count: number }>("/demo/clear", {
      method: "POST",
    }),

  getExportCsvUrl: () => `${API_BASE}/reports/export-csv`,
  getExportPdfUrl: () => `${API_BASE}/reports/export-pdf`,
  getEvaluationCsvUrl: () => `${API_BASE}/evaluation/export-csv`,
};
