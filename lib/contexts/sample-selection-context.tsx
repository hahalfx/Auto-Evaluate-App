'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface SampleSelectionContextType {
  selectedIds: number[];
  setSelectedIds: (ids: number[]) => void;
  toggleSelection: (id: number) => void;
  addSelection: (id: number) => void;
  removeSelection: (id: number) => void;
  clearSelection: () => void;
  isSelected: (id: number) => boolean;
}

const SampleSelectionContext = createContext<SampleSelectionContextType | undefined>(undefined);

export function SampleSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
  }, []);

  const addSelection = useCallback((id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const removeSelection = useCallback((id: number) => {
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const isSelected = useCallback((id: number) => {
    return selectedIds.includes(id);
  }, [selectedIds]);

  const value = {
    selectedIds,
    setSelectedIds,
    toggleSelection,
    addSelection,
    removeSelection,
    clearSelection,
    isSelected,
  };

  return (
    <SampleSelectionContext.Provider value={value}>
      {children}
    </SampleSelectionContext.Provider>
  );
}

export function useSampleSelection() {
  const context = useContext(SampleSelectionContext);
  if (!context) {
    throw new Error('useSampleSelection must be used within SampleSelectionProvider');
  }
  return context;
}