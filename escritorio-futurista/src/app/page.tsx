'use client';

import dynamic from 'next/dynamic';
import AgentPanel from '@/components/AgentPanel';
import MetricsBar from '@/components/MetricsBar';
import AgentDetailsDrawer from '@/components/AgentDetailsDrawer';

// Canvas uses browser APIs — load client-only
const OfficeCanvas = dynamic(() => import('@/components/OfficeCanvas'), { ssr: false });

export default function Home() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* main row */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* canvas area */}
        <div className="flex-1 relative overflow-hidden bg-[#030710]">
          <OfficeCanvas />
          <AgentDetailsDrawer />
        </div>

        {/* right HUD */}
        <AgentPanel />
      </div>

      {/* bottom metrics bar */}
      <MetricsBar />
    </div>
  );
}
