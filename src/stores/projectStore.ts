import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import uuid from 'react-native-uuid';
import type { Project } from '../types';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => string | null;
  setCurrentProject: (id: string | null) => void;
  getCurrentProject: () => Project | null;
  getProjectById: (id: string) => Project | null;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,

      addProject: (projectData) => {
        const id = uuid.v4() as string;
        const now = new Date();
        const newProject: Project = {
          ...projectData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          projects: [newProject, ...state.projects],
          currentProjectId: id,
        }));
        return id;
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }));
      },

      duplicateProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return null;

        const newId = uuid.v4() as string;
        const now = new Date();
        const duplicated: Project = {
          ...project,
          id: newId,
          name: `${project.name} (Copy)`,
          createdAt: now,
          updatedAt: now,
          status: 'draft',
        };
        set((state) => ({
          projects: [duplicated, ...state.projects],
        }));
        return newId;
      },

      setCurrentProject: (id) => {
        set({ currentProjectId: id });
      },

      getCurrentProject: () => {
        const { projects, currentProjectId } = get();
        return projects.find((p) => p.id === currentProjectId) || null;
      },

      getProjectById: (id) => {
        return get().projects.find((p) => p.id === id) || null;
      },
    }),
    {
      name: 'blitzcut-projects',
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          if (!value) return null;
          const parsed = JSON.parse(value);
          // FIX #15: Date string'lerini gerçek Date nesnelerine çevir
          if (parsed?.state?.projects) {
            parsed.state.projects = parsed.state.projects.map((p: any) => ({
              ...p,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            }));
          }
          return parsed;
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
      },
    }
  )
);
