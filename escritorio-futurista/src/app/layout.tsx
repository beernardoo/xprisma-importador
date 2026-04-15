import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Escritório Futurista de IAs',
  description: 'Visualização em pixel art de agentes de IA trabalhando em tempo real.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
