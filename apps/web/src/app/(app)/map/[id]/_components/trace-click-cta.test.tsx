import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TraceClickCta } from './trace-click-cta'
import { useMapStore } from '@/stores/map.store'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  useMapStore.setState({
    activeLayer: null,
    visibleLayers: new Set(['accommodations']),
    zoom: 10,
    center: null,
    fromKm: 0,
    toKm: 30,
    searchRangeInteracted: false,
    searchCommitted: false,
    densityColorEnabled: false,
    weatherActive: false,
    weatherDimension: 'temperature',
    activeAccommodationTypes: new Set(['hotel']),
    selectedPoiId: null,
    selectedStageId: null,
    traceClickedKm: null,
  })
})

describe('TraceClickCta', () => {
  it('renders nothing when traceClickedKm is null', () => {
    const { container } = render(<TraceClickCta />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Km 15.3 when traceClickedKm = 15.3', () => {
    useMapStore.setState({ traceClickedKm: 15.3 })
    render(<TraceClickCta />)
    expect(screen.getByText(/Km 15\.3/)).toBeInTheDocument()
  })

  it('clicking "Rechercher ici" sets fromKm and clears traceClickedKm', () => {
    useMapStore.setState({ traceClickedKm: 15.3, fromKm: 0, toKm: 30 })
    render(<TraceClickCta />)
    fireEvent.click(screen.getByText('Rechercher ici'))
    const state = useMapStore.getState()
    expect(state.fromKm).toBe(15.3)
    expect(state.traceClickedKm).toBeNull()
    expect(state.searchCommitted).toBe(false)
  })

  it('clicking ✕ clears traceClickedKm', () => {
    useMapStore.setState({ traceClickedKm: 15.3 })
    render(<TraceClickCta />)
    fireEvent.click(screen.getByLabelText('Fermer'))
    expect(useMapStore.getState().traceClickedKm).toBeNull()
  })
})
