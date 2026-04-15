'use client';

import { useOfficeStore } from '@/store/officeStore';

export default function MetricsBar() {
  const metrics = useOfficeStore((s) => s.metrics);

  return (
    <div className="h-6 bg-[rgba(3,6,14,0.99)] border-t border-[#0d2847] flex items-center px-3 gap-5 text-[9px] shrink-0 z-50">
      <MetricItem label="AGENTES" value={String(metrics.agentsOnline)} />
      <MetricItem label="TAREFAS" value={String(metrics.activeTasks)} />
      <MetricItem label="CONCLUÍDAS" value={String(metrics.completedTasks)} />
      <MetricItem label="TOKENS" value={metrics.tokensUsed.toLocaleString('pt-BR')} />
      <div className="ml-auto flex gap-1">
        <span className="text-[#1a3558]">MODEL</span>
        <span className="text-[#00f5ff]">claude-sonnet-4-6</span>
      </div>
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-[5px]">
      <span className="text-[#1a3558]">{label}</span>
      <span className="text-[#00f5ff]">{value}</span>
    </div>
  );
}
