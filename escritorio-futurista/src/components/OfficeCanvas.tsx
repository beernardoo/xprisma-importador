'use client';

import { useEffect, useRef } from 'react';
import { OfficeRenderer } from '@/lib/officeRenderer';
import { useOfficeStore } from '@/store/officeStore';

export default function OfficeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);

  const agents = useOfficeStore((s) => s.agents);
  const setSelectedAgent = useOfficeStore((s) => s.setSelectedAgent);

  // Bootstrap renderer once
  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new OfficeRenderer(canvasRef.current);
    rendererRef.current = renderer;

    renderer.setOnAgentClick((id) => {
      setSelectedAgent(id);
    });

    renderer.start();

    return () => renderer.destroy();
  }, [setSelectedAgent]);

  // Sync agent state to renderer on every Zustand update
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setAgents(
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        color: a.color,
        visorColor: a.visorColor,
        x: a.x,
        y: a.y,
        state: a.state,
        walkFrame: a.walkFrame,
        deskIndex: a.deskIndex,
      }))
    );
  }, [agents]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ background: '#030710' }}
    />
  );
}
