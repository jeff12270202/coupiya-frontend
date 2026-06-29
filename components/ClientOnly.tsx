'use client';

import { useEffect, useState } from 'react';

export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // 在第一次客户端渲染完成之前，什么都不渲染，从而完美避开 Hydration 检查
  if (!hasMounted) {
    return null;
  }

  return <>{children}</>;
}
