import { FeedbacksService } from './feedbacks.service.js'

// ── Resend mock ───────────────────────────────────────────────────────────────

type EmailPayload = { from: string; to: string; subject: string; text: string }

const resendMockRef = {
  send: jest.fn<Promise<{ id: string }>, [EmailPayload]>().mockResolvedValue({ id: 'email-123' }),
}

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (payload: EmailPayload): Promise<{ id: string }> => resendMockRef.send(payload) },
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
      service.create(dto, user)
      // Allow fire-and-forget promise to be dispatched
      await Promise.resolve()

      expect(resendMockRef.send).toHaveBeenCalledTimes(1)
      const arg = resendMockRef.send.mock.calls[0][0]
      expect(arg.subject).toContain('bug')
      expect(arg.text).toContain('The map does not load correctly')
    })

    it('includes user email in the email body', async () => {
      const dto = { category: 'idea', description: 'Add dark mode please' }
      service.create(dto, user)
      await Promise.resolve()

      expect(resendMockRef.send).toHaveBeenCalledTimes(1)
      const arg = resendMockRef.send.mock.calls[0][0]
      expect(arg.text).toContain('user@example.com')
    })

    it('does not send email when RESEND_API_KEY is not set', () => {
      // Service must be instantiated without the key — resend class field is set in constructor
      delete process.env.RESEND_API_KEY
      const serviceWithoutKey = new FeedbacksService()
      const dto = { category: 'bug', description: 'The map does not load correctly' }
      serviceWithoutKey.create(dto, user)

      expect(resendMockRef.send).not.toHaveBeenCalled()
    })
  })
})
