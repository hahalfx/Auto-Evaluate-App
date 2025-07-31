'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import type { Task, TestSample, MachineResponse, TestResult } from '@/types/api';

interface TestExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  currentSampleIndex: number;
  progress: number;
  machineResponses: Record<number, MachineResponse>;
  testResults: Record<number, TestResult>;
  error: string | null;
}

interface TestExecutionContextType {
  state: TestExecutionState;
  startTest: (task: Task) => void;
  pauseTest: () => void;
  resumeTest: () => void;
  stopTest: () => void;
  updateMachineResponse: (sampleId: number, response: MachineResponse) => void;
  updateTestResult: (sampleId: number, result: TestResult) => void;
  setCurrentSampleIndex: (index: number) => void;
  updateProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  resetState: () => void;
}

const initialState: TestExecutionState = {
  isRunning: false,
  isPaused: false,
  currentSampleIndex: 0,
  progress: 0,
  machineResponses: {},
  testResults: {},
  error: null,
};

const TestExecutionContext = createContext<TestExecutionContextType | undefined>(undefined);

export function TestExecutionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TestExecutionState>(initialState);

  const startTest = useCallback((task: Task) => {
    setState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      currentSampleIndex: 0,
      progress: 0,
      machineResponses: {},
      testResults: {},
      error: null,
    }));
  }, []);

  const pauseTest = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: true }));
  }, []);

  const resumeTest = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: false }));
  }, []);

  const stopTest = useCallback(() => {
    setState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
    }));
  }, []);

  const updateMachineResponse = useCallback((sampleId: number, response: MachineResponse) => {
    setState(prev => ({
      ...prev,
      machineResponses: {
        ...prev.machineResponses,
        [sampleId]: response,
      },
    }));
  }, []);

  const updateTestResult = useCallback((sampleId: number, result: TestResult) => {
    setState(prev => ({
      ...prev,
      testResults: {
        ...prev.testResults,
        [sampleId]: result,
      },
    }));
  }, []);

  const setCurrentSampleIndex = useCallback((index: number) => {
    setState(prev => ({ ...prev, currentSampleIndex: index }));
  }, []);

  const updateProgress = useCallback((progress: number) => {
    setState(prev => ({ ...prev, progress }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  const value = {
    state,
    startTest,
    pauseTest,
    resumeTest,
    stopTest,
    updateMachineResponse,
    updateTestResult,
    setCurrentSampleIndex,
    updateProgress,
    setError,
    resetState,
  };

  return (
    <TestExecutionContext.Provider value={value}>
      {children}
    </TestExecutionContext.Provider>
  );
}

export function useTestExecution() {
  const context = useContext(TestExecutionContext);
  if (!context) {
    throw new Error('useTestExecution must be used within TestExecutionProvider');
  }
  return context;
}