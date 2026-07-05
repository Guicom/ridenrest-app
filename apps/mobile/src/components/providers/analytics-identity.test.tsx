import { render } from '@testing-library/react-native';

import { AnalyticsIdentity } from '@/components/providers/analytics-identity';
import { useSession } from '@/lib/auth/client';
import { identifyUser } from '@/lib/analytics/posthog';

// Tests AnalyticsIdentity (MOB-6.1 / T7, AC2). On mocke le WRAPPER `@/lib/auth/client`
// (jamais `@better-auth/expo`, cf. AGENTS.md) + le module PostHog (key-gated en réel).
jest.mock('@/lib/auth/client', () => ({ useSession: jest.fn() }));
jest.mock('@/lib/analytics/posthog', () => ({ identifyUser: jest.fn() }));

const mockUseSession = useSession as unknown as jest.Mock;
const mockIdentify = identifyUser as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AnalyticsIdentity', () => {
  it('identify(user.id) dès qu’une session existe — jamais d’email/PII', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'jane@example.com', name: 'Jane' } },
    });

    await render(<AnalyticsIdentity />);

    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockIdentify).toHaveBeenCalledWith('user-123');
    // RGPD : aucun appel ne doit contenir l’email / le nom.
    const allArgs = mockIdentify.mock.calls.flat();
    expect(allArgs).not.toContain('jane@example.com');
    expect(allArgs).not.toContain('Jane');
  });

  it('aucun identify sans session', async () => {
    mockUseSession.mockReturnValue({ data: null });

    await render(<AnalyticsIdentity />);

    expect(mockIdentify).not.toHaveBeenCalled();
  });
});
