'use client';

import { useOfficeStore } from '@/store/officeStore';

export default function LogFeed() {
  const logs = useOfficeStore((s) => s.logs);

  return (
    <div className="flex-1 overflow-hidden px-3 py-[10px] min-h-0">
      <div className="text-[8px] tracking-[3px] text-[#00f5ff] font-orbitron mb-[6px]">
        ◈ LOG AO VIVO
      </div>
      <div className="overflow-hidden" style={{ maxHeight: '100%' }}>
        {logs.slice(0, 18).map((log) => (
          <div key={log.id} className="flex gap-[5px] text-[8px] leading-[1.9]">
            <span className="text-[#1a3558] min-w-[40px] shrink-0">{log.time.slice(0,5)}</span>
            <span className="text-[#486880] truncate">
              {log.agentEmoji} {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
