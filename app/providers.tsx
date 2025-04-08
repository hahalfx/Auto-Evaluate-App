'use client';

import React from 'react';
import { Provider } from 'react-redux'; // 这是正确的导入方式
import { store } from '@/store';

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}

