import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GpxUploadForm } from './gpx-upload-form'

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  createSegment: vi.fn(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock cn (passthrough)
vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { createSegment } from '@/lib/api-client'
import { toast } from 'sonner'

const mockCreateSegment = vi.mocked(createSegment)
const mockToast = vi.mocked(toast)

let uuidCounter = 0
function createFile(name: string, sizeMb: number = 0.1): File {
  const bytes = Math.round(sizeMb * 1024 * 1024)
  return new File([new ArrayBuffer(bytes)], name, { type: 'application/gpx+xml' })
}

function renderForm(props: Partial<Parameters<typeof GpxUploadForm>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onSuccess = vi.fn()
  const onPendingChange = vi.fn()
  return {
    onSuccess,
    onPendingChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <GpxUploadForm
          adventureId="adv-1"
          onSuccess={onSuccess}
          onPendingChange={onPendingChange}
          {...props}
        />
      </QueryClientProvider>,
    ),
  }
}

function getDropZone() {
  return screen.getByText('Glissez vos fichiers GPX ici ou cliquez pour sélectionner').closest('div')!
}

function simulateDrop(zone: Element, files: File[]) {
  const dataTransfer = {
    files,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    types: ['Files'],
  }
  fireEvent.dragOver(zone, { dataTransfer })
  fireEvent.drop(zone, { dataTransfer })
}

describe('GpxUploadForm', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => `uuid-${++uuidCounter}`,
    })
  })

  // 6.1 — Ajout de fichiers via input
  it('adds GPX files via file input and displays them in list', async () => {
    const user = userEvent.setup()
    renderForm()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('.gpx')

    const file1 = createFile('stage1.gpx')
    const file2 = createFile('stage2.gpx')

    await user.upload(input, [file1, file2])

    expect(screen.getByText('stage1.gpx')).toBeInTheDocument()
    expect(screen.getByText('stage2.gpx')).toBeInTheDocument()
  })

  // 6.2 — Rejet des fichiers non-GPX (via drop since input has accept filter)
  it('rejects non-GPX files with a warning on drop', () => {
    renderForm()

    const zone = getDropZone()
    const gpxFile = createFile('route.gpx')
    const pdfFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' })

    simulateDrop(zone, [gpxFile, pdfFile])

    // GPX file should be in the list
    expect(screen.getByText('route.gpx')).toBeInTheDocument()
    // PDF should not
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument()
    // Warning should be visible
    expect(screen.getByText(/1 fichier rejeté/)).toBeInTheDocument()
  })

  // 6.3 — Rejet des fichiers > 10 Mo
  it('marks files exceeding 10 Mo as error', () => {
    renderForm()

    const zone = getDropZone()
    const bigFile = createFile('huge.gpx', 11)
    const normalFile = createFile('small.gpx', 0.5)

    simulateDrop(zone, [normalFile, bigFile])

    expect(screen.getByText('small.gpx')).toBeInTheDocument()
    expect(screen.getByText('huge.gpx')).toBeInTheDocument()
    expect(screen.getByText('Fichier trop volumineux (max 10 Mo)')).toBeInTheDocument()
  })

  // 6.4 — Suppression d'un fichier de la liste
  it('removes a file from the list when clicking the remove button', async () => {
    const user = userEvent.setup()
    renderForm()

    const zone = getDropZone()
    simulateDrop(zone, [createFile('to-remove.gpx')])

    expect(screen.getByText('to-remove.gpx')).toBeInTheDocument()

    const removeButton = screen.getByLabelText('Retirer to-remove.gpx')
    await user.click(removeButton)

    expect(screen.queryByText('to-remove.gpx')).not.toBeInTheDocument()
  })

  // 6.5 — Upload séquentiel avec progression
  it('uploads files sequentially and shows progress', async () => {
    const user = userEvent.setup()

    let resolveUpload1!: () => void
    let resolveUpload2!: () => void

    mockCreateSegment
      .mockImplementationOnce(() => new Promise<unknown>((resolve) => { resolveUpload1 = () => resolve({}) }))
      .mockImplementationOnce(() => new Promise<unknown>((resolve) => { resolveUpload2 = () => resolve({}) }))

    renderForm()

    const zone = getDropZone()
    simulateDrop(zone, [createFile('a.gpx'), createFile('b.gpx')])

    // Click send
    const sendButton = screen.getByRole('button', { name: 'Envoyer' })
    await user.click(sendButton)

    // First file should be uploading
    await waitFor(() => {
      expect(mockCreateSegment).toHaveBeenCalledTimes(1)
    })

    // Resolve first upload
    resolveUpload1()

    // Second file should start
    await waitFor(() => {
      expect(mockCreateSegment).toHaveBeenCalledTimes(2)
    })

    // Resolve second upload
    resolveUpload2()

    // Toast should appear
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('2 segments ajoutés')
    })
  })

  // 6.6 — Erreur sur un fichier → état erreur + bouton Réessayer
  it('shows error state and Retry button when upload fails', async () => {
    const user = userEvent.setup()

    mockCreateSegment.mockRejectedValueOnce(new Error('Network error'))

    renderForm()

    const zone = getDropZone()
    simulateDrop(zone, [createFile('fail.gpx'), createFile('pending.gpx')])

    const sendButton = screen.getByRole('button', { name: 'Envoyer' })
    await user.click(sendButton)

    await waitFor(() => {
      expect(screen.getByText("Échec de l'upload")).toBeInTheDocument()
    })

    // Retry button should be visible
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()

    // Only one call was made (paused after error)
    expect(mockCreateSegment).toHaveBeenCalledTimes(1)
  })

  // 6.7 — Tous succès → onSuccess appelé
  it('calls onSuccess when all files are uploaded successfully', async () => {
    const user = userEvent.setup()
    mockCreateSegment.mockResolvedValue({} as unknown)

    const { onSuccess } = renderForm()

    const zone = getDropZone()
    simulateDrop(zone, [createFile('single.gpx')])

    const sendButton = screen.getByRole('button', { name: 'Envoyer' })
    await user.click(sendButton)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  // Review finding: fichiers invalides (>10Mo) exclus du batch d'upload
  it('excludes validation-error files from upload batch', async () => {
    const user = userEvent.setup()
    mockCreateSegment.mockResolvedValue({} as unknown)

    const { onSuccess } = renderForm()

    const zone = getDropZone()
    simulateDrop(zone, [createFile('valid.gpx', 0.5), createFile('toobig.gpx', 11)])

    const sendButton = screen.getByRole('button', { name: 'Envoyer' })
    await user.click(sendButton)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })

    // Only the valid file should have been uploaded
    expect(mockCreateSegment).toHaveBeenCalledTimes(1)
    expect(mockCreateSegment.mock.calls[0]![1].name).toBe('valid.gpx')
  })

  // Review finding: cache invalidé en cas de succès partiel puis échec
  it('invalidates cache on partial success before failure', async () => {
    const user = userEvent.setup()
    const queryClient = new (await import('@tanstack/react-query')).QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    mockCreateSegment
      .mockResolvedValueOnce({} as unknown) // first file succeeds
      .mockRejectedValueOnce(new Error('fail')) // second file fails

    const { QueryClientProvider } = await import('@tanstack/react-query')
    render(
      <QueryClientProvider client={queryClient}>
        <GpxUploadForm adventureId="adv-1" onSuccess={vi.fn()} onPendingChange={vi.fn()} />
      </QueryClientProvider>,
    )

    const zone = getDropZone()
    simulateDrop(zone, [createFile('ok.gpx'), createFile('fail.gpx')])

    const sendButton = screen.getByRole('button', { name: 'Envoyer' })
    await user.click(sendButton)

    await waitFor(() => {
      expect(screen.getByText("Échec de l'upload")).toBeInTheDocument()
    })

    // Cache should have been invalidated despite the failure (partial success)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adventures', 'adv-1', 'segments'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adventures', 'adv-1'] })

    invalidateSpy.mockRestore()
  })
})
