import { create } from 'zustand';
import { Agent, Task, LogEntry, Metrics, AgentStatus } from '@/types';
import {
  INITIAL_AGENTS,
  INITIAL_TASKS,
  INITIAL_METRICS,
  generateInitialLogs,
  LOG_MESSAGES,
} from '@/lib/mockData';

interface OfficeStore {
  agents: Agent[];
  tasks: Task[];
  logs: LogEntry[];
  metrics: Metrics;
  selectedAgentId: string | null;

  setSelectedAgent: (id: string | null) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  updateAgentStatus: (id: string, status: AgentStatus, task: string) => void;
  updateAgentProfile: (id: string, name: string, role: string, emoji: string, task: string) => void;
  addLog: (entry: Omit<LogEntry, 'id' | 'time'>) => void;
  tickTokens: () => void;
  incrementCompleted: () => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
}

let logCounter = 100;

export const useOfficeStore = create<OfficeStore>((set, get) => ({
  agents: INITIAL_AGENTS,
  tasks: INITIAL_TASKS,
  logs: generateInitialLogs(),
  metrics: INITIAL_METRICS,
  selectedAgentId: null,

  setSelectedAgent: (id) => set({ selectedAgentId: id }),

  updateAgent: (id, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  updateAgentStatus: (id, status, task) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, status, task } : a)),
    })),

  updateAgentProfile: (id, name, role, emoji, task) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, name, role, emoji, task } : a
      ),
    })),

  addLog: (entry) => {
    logCounter++;
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const newEntry: LogEntry = { id: `log-${logCounter}`, time, ...entry };
    set((s) => ({
      logs: [newEntry, ...s.logs].slice(0, 60),
    }));
  },

  tickTokens: () =>
    set((s) => ({
      metrics: {
        ...s.metrics,
        tokensUsed: s.metrics.tokensUsed + Math.floor(Math.random() * 48 + 12),
      },
    })),

  incrementCompleted: () =>
    set((s) => ({
      metrics: { ...s.metrics, completedTasks: s.metrics.completedTasks + 1 },
    })),

  updateTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
}));

// ── Simulation loop (runs outside React) ──────────────────────────────────────
const STATUSES: AgentStatus[] = [
  'Trabalhando',
  'Analisando dados',
  'Executando tarefa',
  'Em reunião',
  'Em descanso',
];

export function startSimulation() {
  // Token counter — fast
  const tokenInterval = setInterval(() => {
    useOfficeStore.getState().tickTokens();
  }, 1800);

  // Agent status rotation — moderate
  const statusInterval = setInterval(() => {
    const { agents, updateAgentStatus, addLog, incrementCompleted } =
      useOfficeStore.getState();

    const agent = agents[Math.floor(Math.random() * agents.length)];
    const newStatus = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    const msgFn = LOG_MESSAGES[Math.floor(Math.random() * LOG_MESSAGES.length)];
    const msg = msgFn(agent.name);

    updateAgentStatus(agent.id, newStatus, agent.task);
    addLog({ agentName: agent.name, agentEmoji: agent.emoji, message: msg });

    if (Math.random() < 0.15) incrementCompleted();
  }, 4500);

  return () => {
    clearInterval(tokenInterval);
    clearInterval(statusInterval);
  };
}
