'use client';

import { useEffect, useState } from 'react';
import { useOfficeStore, startSimulation } from '@/store/officeStore';
import AgentCard from './AgentCard';
import TaskBoard from './TaskBoard';
import LogFeed from './LogFeed';

function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('pt-BR'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-[10px] text-[#00f5ff]">{time}</span>;
}

export default function AgentPanel() {
  const agents = useOfficeStore((s) => s.agents);

  useEffect(() => {
    const stop = startSimulation();
    return stop;
  }, []);

  return (
    <div className="w-[275px] flex flex-col border-l border-[#0d2847] bg-[rgba(4,8,15,0.98)] shrink-0 overflow-hidden">
      {/* top bar */}
      <div className="px-3 py-2 border-b border-[#0d2847] bg-[rgba(0,245,255,0.02)] flex justify-between items-center shrink-0">
        <span className="font-orbitron text-[12px] font-black text-[#00f5ff] tracking-[3px]"
              style={{ textShadow: '0 0 14px #00f5ff' }}>
          ◈ FUTURISTAS HQ
        </span>
        <Clock />
      </div>

      {/* squad */}
      <div className="px-3 py-[10px] border-b border-[#0d2847] shrink-0">
        <div className="text-[8px] tracking-[3px] text-[#00f5ff] font-orbitron mb-2 flex justify-between items-center">
          SQUAD
          <span className="text-[8px] px-[6px] py-[2px] rounded-lg font-bold bg-[#00ff88] text-[#030810]">
            {agents.length} ONLINE
          </span>
        </div>
        <div>
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </div>

      {/* task board */}
      <TaskBoard />

      {/* log */}
      <LogFeed />
    </div>
  );
}
