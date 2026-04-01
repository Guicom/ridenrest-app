import { FeedbacksService } from './feedbacks.service.js'

// ── Resend mock ───────────────────────────────────────────────────────────────

const resendMockRef = { send: jest.fn().mockResolvedValue({ id: 'email-123' }) }

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => resendMockRef.send(...args) },
  })),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

const user = { id: 'user-1', email: 'user@example.com' }

describe('FeedbacksService', () => {
  let service: FeedbacksService

  beforeEach(() => {
    jest.clearAllMocks()
    resendMockRef.send.mockResolvedValue({ id: 'email-123' })
    process.env.RESEND_API_KEY = 're_test_key'
    service = new FeedbacksService()
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
  })

  describe('create()', () => {
    it('sends a Resend email with feedback details', async () => {
      const dto = { category: 'bug', screen: 'map', description: 'The map does not load correctly' }
      await service.create(dto, user)

      expect(resendMockRef.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('bug'),
          text: expect.stringContaining('The map does not load correctly'),
        }),
      )
    })

    it('includes user email in the email body', async () => {
      const dto = { category: 'idea', description: 'Add dark mode please' }
      await service.create(dto, user)

      expect(resendMockRef.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('user@example.com'),
        }),
      )
    })

    it('does not send email when RESEND_API_KEY is not set', async () => {
      // Service must be instantiated without the key — resend class field is set in constructor
      delete process.env.RESEND_API_KEY
      const serviceWithoutKey = new FeedbacksService()
      const dto = { category: 'bug', description: 'The map does not load correctly' }
      await serviceWithoutKey.create(dto, user)

      expect(resendMockRef.send).not.toHaveBeenCalled()
    })
  })
})
