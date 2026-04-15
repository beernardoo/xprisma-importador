export type AgentState =
  | 'walking_to_desk'
  | 'sitting'
  | 'walking_to_coffee'
  | 'at_coffee'
  | 'walking_to_sofa'
  | 'on_sofa'
  | 'chatting'
  | 'idle';

export type AgentStatus =
  | 'Trabalhando'
  | 'Em reunião'
  | 'Pausado'
  | 'Analisando dados'
  | 'Executando tarefa'
  | 'Em descanso';

export type TaskCategory = 'COPY' | 'DATA' | 'ADS' | 'DESIGN' | 'SEO' | 'TRÁFEGO' | 'CRM' | 'OPS';
export type TaskStatus = 'andamento' | 'bloqueado' | 'concluido';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  color: string;
  visorColor: string;
  status: AgentStatus;
  task: string;
  state: AgentState;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  walkFrame: number;
  deskIndex: number;
  stateTimer: number;
}

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  agentId?: string;
  priority: 'alta' | 'media' | 'baixa';
}

export interface LogEntry {
  id: string;
  time: string;
  agentName: string;
  agentEmoji: string;
  message: string;
}

export interface Metrics {
  agentsOnline: number;
  activeTasks: number;
  completedTasks: number;
  tokensUsed: number;
}
