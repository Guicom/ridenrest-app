import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './ui.store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      pendingJobs: [],
      selectedPoiId: null,
      toastMessage: null,
      toastType: null,
    })
  })

  it('initializes with correct defaults', () => {
    const state = useUIStore.getState()
    expect(state.pendingJobs).toHaveLength(0)
    expect(state.selectedPoiId).toBeNull()
    expect(state.toastMessage).toBeNull()
  })

  it('addPendingJob appends a job', () => {
    const job = { segmentId: 'seg-1', type: 'gpx-parsing' as const, startedAt: Date.now() }
    useUIStore.getState().addPendingJob(job)
    expect(useUIStore.getState().pendingJobs).toHaveLength(1)
    expect(useUIStore.getState().pendingJobs[0].segmentId).toBe('seg-1')
  })

  it('removePendingJob removes job by segmentId', () => {
    const job = { segmentId: 'seg-1', type: 'gpx-parsing' as const, startedAt: Date.now() }
    useUIStore.getState().addPendingJob(job)
    useUIStore.getState().removePendingJob('seg-1')
    expect(useUIStore.getState().pendingJobs).toHaveLength(0)
  })

  it('setSelectedPoi updates selectedPoiId', () => {
    useUIStore.getState().setSelectedPoi('poi-abc')
    expect(useUIStore.getState().selectedPoiId).toBe('poi-abc')
  })

  it('showToast sets message and type', () => {
    useUIStore.getState().showToast('Upload complet', 'success')
    const state = useUIStore.getState()
    expect(state.toastMessage).toBe('Upload complet')
    expect(state.toastType).toBe('success')
  })

  it('clearToast resets toast state', () => {
    useUIStore.setState({ toastMessage: 'test', toastType: 'error' })
    useUIStore.getState().clearToast()
    expect(useUIStore.getState().toastMessage).toBeNull()
    expect(useUIStore.getState().toastType).toBeNull()
  })

  it('removePendingJob is no-op when segmentId does not exist', () => {
    const job = { segmentId: 'seg-1', type: 'gpx-parsing' as const, startedAt: Date.now() }
    useUIStore.getState().addPendingJob(job)
    useUIStore.getState().removePendingJob('nonexistent')
    expect(useUIStore.getState().pendingJobs).toHaveLength(1)
  })
})
