'use client';

import FloatingChat from '@/components/FloatingChat';

export default function BlogClientWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <FloatingChat />
    </>
  );
}