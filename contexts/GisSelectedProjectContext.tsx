'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type GisSelectedProject = {
  id: string;
  name: string;
};

type GisSelectedProjectContextValue = {
  project: GisSelectedProject | null;
  setGisSelectedProject: (project: GisSelectedProject | null) => void;
  clearGisSelectedProject: () => void;
};

const GisSelectedProjectContext =
  createContext<GisSelectedProjectContextValue | null>(null);

export function GisSelectedProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<GisSelectedProject | null>(null);

  const setGisSelectedProject = useCallback((next: GisSelectedProject | null) => {
    setProject(next);
  }, []);

  const clearGisSelectedProject = useCallback(() => {
    setProject(null);
  }, []);

  const value = useMemo(
    () => ({
      project,
      setGisSelectedProject,
      clearGisSelectedProject,
    }),
    [project, setGisSelectedProject, clearGisSelectedProject],
  );

  return (
    <GisSelectedProjectContext.Provider value={value}>
      {children}
    </GisSelectedProjectContext.Provider>
  );
}

export function useGisSelectedProject() {
  const ctx = useContext(GisSelectedProjectContext);
  if (!ctx) {
    throw new Error(
      'useGisSelectedProject deve ser usado dentro de GisSelectedProjectProvider',
    );
  }
  return ctx;
}
