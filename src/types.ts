export type CheckStatus = 'pass' | 'fail' | 'warn';

export type CheckItem = {
  name: string;
  status: CheckStatus;
  message: string;
  latencyMs?: number;
};

export type ToolInfo = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type ToolCallResult = {
  tool: string;
  status: CheckStatus;
  latencyMs: number;
  error?: string;
  source: 'sidecar' | 'auto';
};

export type ToolSidecarEntry = {
  input: Record<string, unknown>;
  expect?: {
    not_error_code?: number[];
  };
};

export type ToolSidecar = {
  tools: Record<string, ToolSidecarEntry>;
};

export type ServerInfo = {
  name: string;
  version: string;
  capabilities: string[];
};

export type TransportMode = 'stdio' | 'http' | 'sse';

export type ResolvedTarget = {
  transport: TransportMode;
  command?: string;
  args?: string[];
  url?: string;
};

export type CheckReport = {
  target: string;
  timestamp: string;
  overallStatus: CheckStatus;
  checks: CheckItem[];
  serverInfo?: ServerInfo;
  tools: ToolInfo[];
  resources: ResourceInfo[];
  prompts: PromptInfo[];
  toolCallResults?: ToolCallResult[];
  totalLatencyMs: number;
};

export type CheckOptions = {
  target: string;
  serverArgs?: string[];
  timeoutMs: number;
  transport?: TransportMode;
  headers?: Record<string, string>;
  probeTools?: boolean;
  toolsFile?: string;
};

export type ConfigServer = {
  name: string;
  target: string;
  serverArgs?: string[];
  timeoutMs?: number;
  transport?: TransportMode;
  headers?: Record<string, string>;
  probeTools?: boolean;
  toolsFile?: string;
};

export type ProbeConfig = {
  timeoutMs?: number;
  servers: ConfigServer[];
};

export type BatchServerReport = {
  name: string;
  report: CheckReport;
};

export type BatchReport = {
  target: string;
  timestamp: string;
  overallStatus: CheckStatus;
  servers: BatchServerReport[];
  totalLatencyMs: number;
};

export type ResourceInfo = {
  uri: string;
  name?: string;
  description?: string;
};

export type PromptInfo = {
  name: string;
  description?: string;
};

export type ProbeResult = {
  serverInfo: ServerInfo;
  tools: ToolInfo[];
  resources: ResourceInfo[];
  prompts: PromptInfo[];
  connectLatencyMs: number;
  toolsLatencyMs: number;
  resourcesLatencyMs?: number;
  promptsLatencyMs?: number;
  toolCallResults?: ToolCallResult[];
};

export type ProbeOptions = {
  transport: TransportMode;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  probeTools?: boolean;
  sidecar?: ToolSidecar;
};
