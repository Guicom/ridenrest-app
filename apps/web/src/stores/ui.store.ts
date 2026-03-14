import { create } from 'zustand'

interface PendingJob {
  segmentId: string
  type: 'gpx-parsing' | 'density-analysis'
  startedAt: number
}

interface UIState {
  // Global loading/pending
  pendingJobs: PendingJob[]

  // POI detail sheet
  selectedPoiId: string | null

  // Toast/notification
  toastMessage: string | null
  toastType: 'success' | 'error' | 'info' | null

  // Actions
  addPendingJob: (job: PendingJob) => void
  removePendingJob: (segmentId: string) => void
  setSelectedPoi: (poiId: string | null) => void
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  clearToast: () => void
}

export const useUIStore = create<UIState>((set) => ({
  pendingJobs: [],
  selectedPoiId: null,
  toastMessage: null,
  toastType: null,

  addPendingJob: (job) => set((state) => ({ pendingJobs: [...state.pendingJobs, job] })),

  removePendingJob: (segmentId) =>
    set((state) => ({
      pendingJobs: state.pendingJobs.filter((j) => j.segmentId !== segmentId),
    })),

  setSelectedPoi: (poiId) => set({ selectedPoiId: poiId }),

  showToast: (message, type) => set({ toastMessage: message, toastType: type }),
  clearToast: () => set({ toastMessage: null, toastType: null }),
}))
