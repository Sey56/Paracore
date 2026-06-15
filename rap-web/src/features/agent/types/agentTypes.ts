import { Script } from "@/types/scriptModel";

// Define the structure of a message in our chat
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Define the structure of a pending tool call that needs approval
export interface PendingToolCall {
  name: string;
  arguments: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  id?: string;
}

export interface ThinkingStep {
  tool_name: string;
  justification: string;
  status: 'running' | 'completed' | 'error';
  csharp_code?: string;
  category_name?: string;
  query?: string;
  result_summary?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  requests: number;
}

export interface ChatResponse {
  status: 'interrupted' | 'complete';
  message?: string;
  tool_call?: PendingToolCall;
  thinking_steps?: ThinkingStep[];
  raw_history_json?: string;
  usage?: TokenUsage;
}

export type ToolCall = {
  name: string;
  args: Record<string, string | number | boolean | Record<string, unknown> | unknown[]>;
  id: string;
};

export interface PlanStep {
  script_id: string;
  action: string;
  script_metadata: Script;
  deduced_parameters: Record<string, string | number | boolean>;
  satisfied_parameters: string[];
  missing_parameters: string[];
  status?: 'pending' | 'executing' | 'success' | 'error';
  result_summary?: string;
  parameter_definitions?: Array<{
    name: string;
    description: string;
    isRevitElement: boolean;
    revitElementType: string;
    options: string[];
    required: boolean;
  }>;
}

export interface OrchestrationPlan {
  action: string;
  explanation: string;
  steps: PlanStep[];
}

// This defines the shape of messages coming directly from the LangGraph state
export type Message = {
  type: 'human' | 'ai' | 'tool';
  content: string | { text: string }[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  id?: string; // Langchain message ID
  plan?: OrchestrationPlan;
  raw_history?: string; // High-fidelity PydanticAI history blob
  thinking_steps?: ThinkingStep[]; // Agent exploration/search steps
};
