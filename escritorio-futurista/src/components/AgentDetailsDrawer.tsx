'use client';

import { useState } from 'react';
import { useOfficeStore } from '@/store/officeStore';
import AgentEditModal from './AgentEditModal';

const STATUS_DOT: Record<string, string> = {
  'Trabalhando':      'bg-green-400',
  'Em reunião':       'bg-cyan-400',
  'Pausado':          'bg-orange-400',
  'Analisando dados': 'bg-cyan-400',
  'Executando tarefa':'bg-green-400',
  'Em descanso':      'bg-purple-400',
};

export default function AgentDetailsDrawer() {
  const selectedId = useOfficeStore((s) => s.selectedAgentId);
  const setSelected = useOfficeStore((s) => s.setSelectedAgent);
  const agents = useOfficeStore((s) => s.agents);
  const tasks  = useOfficeStore((s) => s.tasks);
  const [editOpen, setEditOpen] = useState(false);

  const agent = agents.find((a) => a.id === selectedId);
  if (!agent) return null;

  const agentTasks = tasks.filter((t) => t.agentId === agent.id);

  return (
    <>
    <div className="absolute bottom-8 right-[285px] w-[220px] bg-[rgba(4,8,15,0.97)] border border-[#0d2847] rounded-sm shadow-2xl z-40 font-mono text-[10px]"
         style={{ boxShadow: '0 0 32px rgba(0,245,255,0.08)' }}>
      {/* header */}
      <div className="flex items-center justify-between px-3 py-[8px] border-b border-[#0d2847]">
        <div className="flex items-center gap-2">
          <span className="text-base">{agent.emoji}</span>
          <div>
            <div className="text-[12px] text-white font-bold">{agent.name}</div>
            <div className="text-[9px] text-[#4a6888] tracking-wide">{agent.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="text-[#1a3558] hover:text-[#00f5ff] text-[10px] tracking-widest border border-[#0d2847] hover:border-[#00f5ff]/40 px-2 py-[2px] rounded-sm"
            title="Editar agente"
          >
            ✏ EDITAR
          </button>
          <button onClick={() => setSelected(null)} className="text-[#1a3558] hover:text-[#00f5ff] text-lg leading-none">×</button>
        </div>
      </div>

      {/* status */}
      <div className="px-3 py-[8px] border-b border-[#0d2847]">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status] ?? 'bg-gray-400'}`} />
          <span className="text-[#00f5ff]">{agent.status}</span>
        </div>
        <div className="text-[#486880] text-[9px]">{agent.task}</div>
      </div>

      {/* color swatch */}
      <div className="px-3 py-[6px] border-b border-[#0d2847] flex items-center gap-2">
        <span className="w-3 h-3 rounded-full border border-white/10" style={{ background: agent.color }} />
        <span className="text-[#4a6888] text-[9px]">{agent.color} / {agent.visorColor}</span>
      </div>

      {/* tasks */}
      <div className="px-3 py-[8px]">
        <div className="text-[8px] text-[#00f5ff] tracking-widest mb-2">TAREFAS ASSOCIADAS</div>
        {agentTasks.length === 0 && (
          <div className="text-[#1a3558] text-[9px]">Nenhuma tarefa</div>
        )}
        {agentTasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between mb-1">
            <span className="text-[#88a8c0] truncate">{t.title}</span>
            <span className={`text-[7px] px-1 py-[1px] rounded-sm ml-2 ${
              t.status === 'concluido' ? 'bg-green-500/20 text-green-400' :
              t.status === 'bloqueado' ? 'bg-red-500/20 text-red-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {t.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>

    {editOpen && (
      <AgentEditModal agentId={selectedId} onClose={() => setEditOpen(false)} />
    )}
    </>
  );
}
