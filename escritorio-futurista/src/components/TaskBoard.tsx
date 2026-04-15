'use client';

import { useOfficeStore } from '@/store/officeStore';
import { Task, TaskCategory } from '@/types';

const CAT_COLORS: Record<TaskCategory, string> = {
  COPY:     'bg-blue-500/10 text-blue-300 border-blue-500/20',
  DATA:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/15',
  ADS:      'bg-orange-500/10 text-orange-400 border-orange-500/20',
  DESIGN:   'bg-purple-500/10 text-purple-300 border-purple-500/20',
  SEO:      'bg-teal-500/10 text-teal-300 border-teal-500/15',
  TRÁFEGO:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/15',
  CRM:      'bg-green-500/10 text-green-400 border-green-500/15',
  OPS:      'bg-red-500/10 text-red-400 border-red-500/15',
};

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="bg-black/30 border border-[#0d2847] rounded-sm p-[4px_6px] mb-1 text-[8px] text-[#88a8c0] leading-[1.5]">
      <span className={`inline-block text-[7px] px-1 py-[1px] rounded-sm mb-[2px] tracking-wide border ${CAT_COLORS[task.category]}`}>
        {task.category}
      </span>
      <div className="truncate">{task.title}</div>
    </div>
  );
}

export default function TaskBoard() {
  const tasks = useOfficeStore((s) => s.tasks);
  const doing  = tasks.filter((t) => t.status === 'andamento');
  const blocked= tasks.filter((t) => t.status === 'bloqueado');
  const done   = tasks.filter((t) => t.status === 'concluido');

  return (
    <div className="panel border-b border-[#0d2847] px-3 py-[10px]">
      <div className="text-[8px] tracking-[3px] text-[#00f5ff] font-orbitron mb-2 flex justify-between items-center">
        TAREFAS
        <span className="text-[8px] px-[6px] py-[2px] rounded-lg font-bold bg-orange-500 text-[#030810]">
          {doing.length} ATIVAS
        </span>
      </div>
      <div className="grid grid-cols-3 gap-[6px]">
        <div>
          <div className="text-[8px] tracking-[2px] text-orange-400 mb-[5px] pb-1 border-b border-[#0d2847]">ANDAMENTO</div>
          {doing.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
        <div>
          <div className="text-[8px] tracking-[2px] text-[#ff3366] mb-[5px] pb-1 border-b border-[#0d2847]">BLOQUEADO</div>
          {blocked.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
        <div>
          <div className="text-[8px] tracking-[2px] text-green-400 mb-[5px] pb-1 border-b border-[#0d2847]">CONCLUÍDO</div>
          {done.slice(0, 4).map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      </div>
    </div>
  );
}
