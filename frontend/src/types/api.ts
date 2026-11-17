export type RequestStateType =
  | "RECEBIDA"
  | "EM_PROCESSAMENTO"
  | "AGUARDANDO_INFORMACOES"
  | "AGUARDANDO_APROVACAO"
  | "APROVADA"
  | "REJEITADA"
  | "EXECUTADA"
  | "CONCLUIDA"
  | "ERRO";

export type RiskLevelType = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";

export interface HealthStatus {
  status: string;
  app_name: string;
  version: string;
  operation_mode: "LOCAL" | "LLM";
  effective_mode: "LOCAL" | "LLM";
  mode_badge: string;
  llm_provider: string;
  llm_model: string;
  has_api_key_configured: boolean;
  total_requests: number;
  demo_requests: number;
  real_requests: number;
  pending_approvals: number;
}

export interface ImpactSimulation {
  is_configurable_estimate: boolean;
  disclaimer: string;
  request_count: number;
  manual_minutes_per_request: number;
  estimated_manual_minutes: number;
  estimated_manual_hours: number;
  automated_execution_minutes: number;
  human_review_count: number;
  human_review_minutes_each: number;
  human_review_total_minutes: number;
  total_automated_minutes: number;
  total_automated_hours: number;
  estimated_saved_minutes: number;
  estimated_saved_hours: number;
  time_reduction_pct: number;
}

export interface AgentVolumeItem {
  agent_id: string;
  name: string;
  executions: number;
  errors: number;
  avg_duration_ms: number;
}

export interface DashboardMetrics {
  total_requests: number;
  completed_requests: number;
  rejected_requests: number;
  pending_requests: number;
  awaiting_approval: number;
  awaiting_info: number;
  error_requests: number;
  completion_rate_pct: number;
  automation_rate_pct: number;
  human_interventions: number;
  avg_processing_ms: number;
  total_processing_ms: number;
  category_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
  daily_evolution: Record<string, number>;
  monthly_evolution: Record<string, number>;
  rejection_reasons: Record<string, number>;
  agent_volume: AgentVolumeItem[];
  estimated_saved_minutes: number;
  estimated_saved_hours: number;
  impact_simulation: ImpactSimulation;
}

export interface AttentionAlert {
  request_id: string;
  title: string;
  requester_name: string;
  department: string;
  status: RequestStateType;
  risk_level: RiskLevelType;
  alert_type: "EXECUTIVE_APPROVAL" | "HUMAN_APPROVAL" | "ERROR" | "MISSING_INFO" | "SECURITY_BLOCKED";
  message: string;
  created_at: string;
}

export interface ProcessingStepRecord {
  step_id: string;
  execution_id: string;
  request_id: string;
  step_order: number;
  agent_id: string;
  agent_name: string;
  responsibility: string;
  status: string;
  operation_mode: string;
  input_summary: string;
  output_json: string;
  output?: Record<string, any>;
  validations_json: string;
  validations?: string[];
  decision_summary: string;
  next_stage: string;
  duration_ms: number;
  created_at: string;
  request_title?: string;
  request_category?: string;
}

export interface DashboardResponse {
  metrics: DashboardMetrics;
  department_distribution: { department: string; count: number }[];
  attention_alerts: AttentionAlert[];
  recent_agent_activity: ProcessingStepRecord[];
  mode_badge: string;
}

export interface RequestItem {
  request_id: string;
  title: string;
  requester_name: string;
  requester_department: string;
  source: string;
  raw_text: string;
  sanitized_text: string;
  form_data: Record<string, any>;
  category: string;
  category_label: string;
  intent: string;
  confidence: number;
  classification_uncertain: number | boolean;
  priority: string;
  risk_level: RiskLevelType;
  status: RequestStateType;
  extracted_data: Record<string, any>;
  missing_fields: string[];
  executive_summary: string;
  final_response: string;
  rejection_reason?: string | null;
  requires_human_approval: number | boolean;
  human_intervention_occurred: number | boolean;
  prompt_injection_detected: number | boolean;
  is_demo: number | boolean;
  total_processing_ms: number;
  created_at: string;
  updated_at: string;
}

export interface ActionPerformedRecord {
  action_id: string;
  request_id: string;
  agent_id: string;
  tool_name: string;
  action_type: string;
  idempotency_key: string;
  status: string;
  output_summary: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface ApprovalRecord {
  approval_id: string;
  request_id: string;
  rule_triggered: string;
  risk_level: RiskLevelType;
  status: "PENDENTE" | "APROVADA" | "REJEITADA" | "SOLICITAR_INFO";
  reviewer_name?: string | null;
  decision_justification?: string | null;
  requested_at: string;
  decided_at?: string | null;
  title?: string;
  requester_name?: string;
  requester_department?: string;
  category?: string;
  category_label?: string;
  raw_text?: string;
  extracted_data?: Record<string, any>;
  request_status?: RequestStateType;
  amount?: number | null;
  is_executive_escalation?: boolean;
  triggered_rules_details?: PolicyRuleRecord[];
}

export interface AuditLogRecord {
  audit_id: string;
  request_id?: string | null;
  actor: string;
  event_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface FullRequestTrace {
  request: RequestItem;
  steps: ProcessingStepRecord[];
  actions: ActionPerformedRecord[];
  approvals: ApprovalRecord[];
  audit_logs: AuditLogRecord[];
}

export interface AgentTelemetry {
  agent_id: string;
  name: string;
  responsibility: string;
  status: string;
  total_executions: number;
  total_errors: number;
  avg_duration_ms: number;
  last_execution_at?: string | null;
  pipeline_order: number;
  allowed_tools: string[];
  last_result_summary: string;
  last_request_id?: string | null;
  last_step_status?: string | null;
  recent_history: ProcessingStepRecord[];
}

export interface PolicyRuleRecord {
  rule_code: string;
  rule_name: string;
  category: string;
  description: string;
  parameter_key: string;
  parameter_value: number;
  action_on_trigger: string;
  risk_level: RiskLevelType;
  is_active: number | boolean;
  updated_at: string;
}

export interface EvaluationCaseResult {
  case_id: string;
  scenario_group: string;
  title: string;
  expected_category: string;
  obtained_category: string;
  category_match: boolean;
  extraction_match: boolean;
  expected_state: string;
  obtained_state: string;
  state_match: boolean;
  requires_human: boolean;
  duration_ms: number;
}

export interface EvaluationRunResult {
  total_cases: number;
  classification_accuracy_pct: number;
  extraction_accuracy_pct: number;
  policy_compliance_pct: number;
  correct_completion_rate_pct?: number;
  human_intervention_rate_pct?: number;
  false_positives: number;
  false_negatives: number;
  true_positives?: number;
  true_negatives?: number;
  avg_processing_ms: number;
  total_suite_duration_ms?: number;
  state_confusion_matrix: Record<string, Record<string, number>>;
  state_labels?: string[];
  case_results: EvaluationCaseResult[];
  executed_at: string;
  mode_used: string;
}

export interface EvaluationHistoryItem {
  run_id: string;
  executed_at: string;
  mode_used: string;
  total_cases: number;
  classification_accuracy_pct: number;
  extraction_accuracy_pct: number;
  policy_compliance_pct: number;
  false_positives: number;
  false_negatives: number;
  avg_processing_ms: number;
}

export interface EvaluationStatusResponse {
  latest: EvaluationRunResult;
  history: EvaluationHistoryItem[];
  benchmark_suite_size?: number;
}

export interface SystemSettingsResponse {
  app_name: string;
  app_version: string;
  operation_mode: "LOCAL" | "LLM";
  effective_mode: "LOCAL" | "LLM";
  mode_badge: string;
  llm_provider: "openai" | "gemini" | "compatible";
  llm_model: string;
  has_api_key_configured: boolean;
  api_key_masked: string;
  security_info: {
    prompt_injection_patterns_count: number;
    rbac_permissions: Record<string, string[]>;
    idempotency_algorithm: string;
    audit_redaction_active: boolean;
    known_limitations: string;
  };
  environment_info: {
    database_engine: string;
    database_path: string;
    required_fields_by_category: Record<string, string[]>;
    manual_minutes_per_request: number;
    human_review_minutes: number;
  };
  policy_rules: PolicyRuleRecord[];
  audit_logs: AuditLogRecord[];
}
