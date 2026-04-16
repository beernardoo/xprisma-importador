'use client';
import { useState, useEffect } from 'react';
import { useOfficeStore } from '@/store/officeStore';

interface Props {
  agentId: string | null;
  onClose: () => void;
}

export default function AgentEditModal({ agentId, onClose }: Props) {
  const agents = useOfficeStore(s => s.agents);
  const updateAgentProfile = useOfficeStore(s => s.updateAgentProfile);
  const agent = agents.find(a => a.id === agentId);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [emoji, setEmoji] = useState('');
  const [task, setTask] = useState('');

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setRole(agent.role);
      setEmoji(agent.emoji);
      setTask(agent.task);
    }
  }, [agent]);

  if (!agent) return null;

  const handleSave = () => {
    updateAgentProfile(
      agent.id,
      name.trim() || agent.name,
      role.trim() || agent.role,
      emoji.trim() || agent.emoji,
      task.trim() || agent.task,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="w-[340px] border border-[#0d2847] rounded-sm font-mono text-[11px]"
        style={{ background: '#04080f', boxShadow: '0 0 40px rgba(0,245,255,0.1)' }}
      >
        {/* header */}
        <div className="px-4 py-3 border-b border-[#0d2847] flex items-center justify-between">
          <span className="font-orbitron text-[11px] font-black text-[#00f5ff] tracking-[2px]">EDITAR AGENTE</span>
          <button onClick={onClose} className="text-[#1a3558] hover:text-[#00f5ff] text-lg leading-none">×</button>
        </div>

        {/* body */}
        <div className="px-4 py-4 space-y-3">
          {/* emoji + name row */}
          <div className="flex gap-2">
            <div className="w-16">
              <label className="block text-[8px] text-[#4a6888] tracking-widest mb-1">EMOJI</label>
              <input
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                className="w-full bg-[#0d2847]/40 border border-[#0d2847] text-white text-center text-lg px-1 py-1 rounded-sm focus:border-[#00f5ff] outline-none"
                maxLength={2}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[8px] text-[#4a6888] tracking-widest mb-1">NOME</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#0d2847]/40 border border-[#0d2847] text-[#00f5ff] px-2 py-1.5 rounded-sm focus:border-[#00f5ff] outline-none text-[11px]"
                placeholder="Ex: Atlas"
              />
            </div>
          </div>

          {/* role */}
          <div>
            <label className="block text-[8px] text-[#4a6888] tracking-widest mb-1">FUNÇÃO / SERVIÇO</label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full bg-[#0d2847]/40 border border-[#0d2847] text-[#88a8c0] px-2 py-1.5 rounded-sm focus:border-[#00f5ff] outline-none text-[11px]"
              placeholder="Ex: Copywriter AI"
            />
          </div>

          {/* task */}
          <div>
            <label className="block text-[8px] text-[#4a6888] tracking-widest mb-1">TAREFA / DESCRIÇÃO</label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              rows={3}
              className="w-full bg-[#0d2847]/40 border border-[#0d2847] text-[#88a8c0] px-2 py-1.5 rounded-sm focus:border-[#00f5ff] outline-none text-[11px] resize-none"
              placeholder="Descreva o serviço que este agente executa..."
            />
          </div>
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-[#0d2847] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[10px] border border-[#0d2847] text-[#4a6888] hover:text-[#88a8c0] rounded-sm tracking-widest"
          >
            CANCELAR
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-[10px] bg-[#00f5ff]/10 border border-[#00f5ff]/40 text-[#00f5ff] hover:bg-[#00f5ff]/20 rounded-sm tracking-widest font-bold"
          >
            SALVAR
          </button>
        </div>
      </div>
    </div>
  );
}
