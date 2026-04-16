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

  // Break room waypoints (x, y, arrivalState)
  const BREAK_SPOTS: [number,number,string][] = [
    [480, 210, 'on_sofa'],
    [555, 215, 'on_sofa'],
    [470, 180, 'chatting'],
    [510, 290, 'chatting'],
    [525, 255, 'idle'],
    [498, 320, 'at_coffee'],
    [590, 290, 'idle'],
    [575, 190, 'chatting'],
  ];

  // Work area waypoints (x, y, arrivalState)
  const WORK_SPOTS: [number,number,string][] = [
    [150, 155, 'sitting'],  // desk 0
    [228, 155, 'sitting'],  // desk 1
    [306, 155, 'sitting'],  // desk 2
    [384, 155, 'sitting'],  // desk 3
    [26,  240, 'at_coffee'],
    [58,  340, 'idle'],
    [175, 290, 'at_coffee'],
    [80,  200, 'idle'],
    [200, 280, 'chatting'],
    [100, 310, 'chatting'],
  ];

  const BREAK_ROOM_IDS = new Set(['wink', 'dino', 'aranha']);
  const WALK_SPEED = 0.9;

  const moveInterval = setInterval(() => {
    const store = useOfficeStore.getState();
    const agents = store.agents;

    agents.forEach(agent => {
      const isBreak = BREAK_ROOM_IDS.has(agent.id);
      const spots = isBreak ? BREAK_SPOTS : WORK_SPOTS;

      if (agent.state.startsWith('walking')) {
        // Move toward target
        const dx = agent.targetX - agent.x;
        const dy = agent.targetY - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
          // Arrived — switch to arrival state, set timer
          store.updateAgent(agent.id, {
            x: agent.targetX,
            y: agent.targetY,
            state: agent.state.replace('walking_to_', '') === 'desk' ? 'sitting'
                  : agent.state.replace('walking_', ''),
            walkFrame: 0,
            stateTimer: 180 + Math.floor(Math.random() * 300),
          });
        } else {
          // Still walking
          store.updateAgent(agent.id, {
            x: agent.x + (dx / dist) * WALK_SPEED,
            y: agent.y + (dy / dist) * WALK_SPEED,
            walkFrame: (agent.walkFrame + 1) % 4,
          });
        }
      } else {
        // Idle — count down timer
        const newTimer = agent.stateTimer - 1;
        if (newTimer <= 0) {
          // Pick random new spot
          const [tx, ty, _] = spots[Math.floor(Math.random() * spots.length)];
          store.updateAgent(agent.id, {
            targetX: tx,
            targetY: ty,
            state: 'walking',
            stateTimer: 0,
          });
        } else {
          store.updateAgent(agent.id, { stateTimer: newTimer });
        }
      }
    });
  }, 50);

  return () => {
    clearInterval(tokenInterval);
    clearInterval(statusInterval);
    clearInterval(moveInterval);
  };
}
