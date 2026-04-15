'use client';

import { useEffect, useState } from 'react';
import AgentPanel from '@/components/AgentPanel';
import MetricsBar from '@/components/MetricsBar';
import AgentDetailsDrawer from '@/components/AgentDetailsDrawer';
import OfficeCanvas from '@/components/OfficeCanvas';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {/* canvas area */}
        <div className="flex-1 relative overflow-hidden bg-[#030710]">
          {mounted && <OfficeCanvas />}
          <AgentDetailsDrawer />
        </div>
        <AgentPanel />
      </div>
      <MetricsBar />
    </div>
  );
}
