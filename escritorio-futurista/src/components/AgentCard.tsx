'use client';

import { Agent } from '@/types';
import { useOfficeStore } from '@/store/officeStore';

const STATUS_STYLES: Record<string, string> = {
  'Trabalhando':      'bg-green-500/10 text-green-400 border border-green-500/25',
  'Em reunião':       'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  'Pausado':          'bg-orange-500/10 text-orange-400 border border-orange-500/25',
  'Analisando dados': 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  'Executando tarefa':'bg-green-500/10 text-green-400 border border-green-500/25',
  'Em descanso':      'bg-purple-500/10 text-purple-300 border border-purple-500/20',
};

interface Props { agent: Agent }

export default function AgentCard({ agent }: Props) {
  const selectedId = useOfficeStore((s) => s.selectedAgentId);
  const setSelected = useOfficeStore((s) => s.setSelectedAgent);
  const isSelected = selectedId === agent.id;

  return (
    <div
      onClick={() => setSelected(isSelected ? null : agent.id)}
      className={`flex items-center gap-2 py-[5px] border-b border-[#0d2847]/40 last:border-0 cursor-pointer transition-colors ${
        isSelected ? 'bg-cyan-500/5' : 'hover:bg-white/[0.02]'
      }`}
    >
      <span className="text-sm w-[22px] text-center">{agent.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-200 font-medium truncate">{agent.name}</div>
        <div className="text-[8px] text-[#4a6888] tracking-wide truncate">{agent.role}</div>
      </div>
      <span className={`text-[8px] px-[6px] py-[2px] rounded-[2px] font-bold tracking-wide whitespace-nowrap ${STATUS_STYLES[agent.status] ?? ''}`}>
        {agent.status.toUpperCase().slice(0, 6)}…
      </span>
    </div>
  );
}
