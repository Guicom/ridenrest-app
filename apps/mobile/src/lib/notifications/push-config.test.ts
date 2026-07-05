import * as Notifications from 'expo-notifications';

import {
  configureForegroundHandler,
  extractAdventureId,
} from '@/lib/notifications/push-config';

// `push-config` (MOB-6.2 / T5). `expo-notifications` mocké globalement (jest.setup).

type Response = Notifications.NotificationResponse;

function responseWithData(data: unknown): Response {
  return {
    notification: { request: { content: { data } } },
  } as unknown as Response;
}

describe('extractAdventureId', () => {
  it('returns the adventureId when present in data', () => {
    expect(extractAdventureId(responseWithData({ adventureId: 'adv-42' }))).toBe('adv-42');
  });

  it('returns null when adventureId is missing', () => {
    expect(extractAdventureId(responseWithData({ foo: 'bar' }))).toBeNull();
  });

  it('returns null for a blank adventureId', () => {
    expect(extractAdventureId(responseWithData({ adventureId: '   ' }))).toBeNull();
  });

  it('returns null for a null/undefined response', () => {
    expect(extractAdventureId(null)).toBeNull();
    expect(extractAdventureId(undefined)).toBeNull();
  });

  it('returns null when adventureId is not a string', () => {
    expect(extractAdventureId(responseWithData({ adventureId: 123 }))).toBeNull();
  });
});

describe('configureForegroundHandler', () => {
  it('sets a notification handler that shows the banner without sound', async () => {
    configureForegroundHandler();
    const mockSet = Notifications.setNotificationHandler as jest.Mock;
    expect(mockSet).toHaveBeenCalledTimes(1);
    const handler = mockSet.mock.calls[0][0] as {
      handleNotification: () => Promise<Record<string, boolean>>;
    };
    const behavior = await handler.handleNotification();
    expect(behavior).toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });
  });
});
