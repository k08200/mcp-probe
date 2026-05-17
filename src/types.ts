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

export type ServerInfo = {
  name: string;
  version: string;
  capabilities: string[];
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
};

export type ProbeOptions = {
  command: string;
  args: string[];
  timeoutMs: number;
};
