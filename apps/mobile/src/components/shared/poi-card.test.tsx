import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { Poi } from '@ridenrest/shared';

import { PoiCard } from '@/components/shared/poi-card';

// PoiCard (MOB-4.2 / AC3, 4, T6 — refonte « liquid glass » layout web). Présentationnel
// pur : reçoit les données + des callbacks d'action (navigation/appel/copie/site). i18n
// auto-init `fr` en test. Le conteneur verre (BlurView/Marker/triangle) est dans PoiPopup.

function makePoi(over: Partial<Poi> = {}): Poi {
  return {
    id: 'p1',
    externalId: 'ext1',
    source: 'overpass',
    category: 'hotel',
    name: 'Hôtel du Col',
    lat: 45.9,
    lng: 6.8,
    distFromTraceM: 120,
    distAlongRouteKm: 42.3,
    ...over,
  };
}

describe('PoiCard', () => {
  it('affiche nom, catégorie, distance trace et kilométrage (AC3)', async () => {
    await render(<PoiCard poi={makePoi()} />);
    expect(screen.getByText('Hôtel du Col')).toBeOnTheScreen();
    expect(screen.getByText('Hôtel')).toBeOnTheScreen(); // catégorie i18n
    expect(screen.getByText('À 120 m de la trace')).toBeOnTheScreen();
    expect(screen.getByText('km 42,3')).toBeOnTheScreen();
  });

  it('enrichissement en cours → skeleton scopé, fiche de base visible (AC4)', async () => {
    await render(<PoiCard poi={makePoi()} enrichmentPending city={null} />);
    expect(screen.getByTestId('poi-enrichment-skeleton')).toBeOnTheScreen();
    // La fiche de base reste affichée (jamais bloquée).
    expect(screen.getByText('Hôtel du Col')).toBeOnTheScreen();
  });

  it('enrichissement résolu → ville/adresse affichées', async () => {
    await render(
      <PoiCard poi={makePoi()} city="Chamonix" addressLine="12 rue du Mont" />,
    );
    expect(screen.getByText('Chamonix')).toBeOnTheScreen();
    expect(screen.getByText('12 rue du Mont')).toBeOnTheScreen();
    expect(screen.queryByTestId('poi-enrichment-skeleton')).toBeNull();
  });

  it('sans enrichissement → bloc omis (pas d’erreur globale)', async () => {
    await render(<PoiCard poi={makePoi()} />);
    expect(screen.queryByTestId('poi-enrichment-skeleton')).toBeNull();
    expect(screen.getByText('Hôtel du Col')).toBeOnTheScreen();
  });

  it('bouton fermer → onClose', async () => {
    const onClose = jest.fn();
    await render(<PoiCard poi={makePoi()} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('Fermer la fiche'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bouton naviguer toujours présent → onNavigate', async () => {
    const onNavigate = jest.fn();
    await render(<PoiCard poi={makePoi()} onNavigate={onNavigate} />);
    fireEvent.press(screen.getByLabelText('Naviguer vers Hôtel du Col'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  // NB : pas de `rerender` (RNTL v14 + jest-expo : un `await rerender` laisse `screen`
  // pointer un arbre périmé pour les `it` suivants) → chaque cas a son propre rendu.

  it('téléphone fourni → bouton appeler → onCall', async () => {
    const onCall = jest.fn();
    await render(<PoiCard poi={makePoi()} phone="+33450000000" onCall={onCall} />);
    fireEvent.press(screen.getByLabelText('Appeler Hôtel du Col'));
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it('téléphone absent → pas de bouton appeler (AC4)', async () => {
    await render(<PoiCard poi={makePoi()} onCall={jest.fn()} />);
    expect(screen.queryByLabelText('Appeler Hôtel du Col')).toBeNull();
  });

  it('adresse cliquable → onCopyAddress', async () => {
    const onCopyAddress = jest.fn();
    await render(
      <PoiCard
        poi={makePoi()}
        addressLine="12 rue du Mont"
        onCopyAddress={onCopyAddress}
      />,
    );
    fireEvent.press(screen.getByLabelText("Copier l'adresse"));
    expect(onCopyAddress).toHaveBeenCalledTimes(1);
  });

  it('adresse copiée → label de feedback bascule', async () => {
    await render(
      <PoiCard
        poi={makePoi()}
        addressLine="12 rue du Mont"
        addressCopied
        onCopyAddress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Adresse copiée')).toBeOnTheScreen();
  });

  it('site web fourni → bouton site officiel → onOpenWebsite', async () => {
    const onOpenWebsite = jest.fn();
    await render(
      <PoiCard
        poi={makePoi()}
        website="https://hotel.example"
        onOpenWebsite={onOpenWebsite}
      />,
    );
    fireEvent.press(screen.getByLabelText('Site officiel'));
    expect(onOpenWebsite).toHaveBeenCalledTimes(1);
  });

  it('site web absent → pas de bouton site officiel', async () => {
    await render(<PoiCard poi={makePoi()} onOpenWebsite={jest.fn()} />);
    expect(screen.queryByLabelText('Site officiel')).toBeNull();
  });

  it('rend les slots enfants (booking MOB-4.5 / accès MOB-4.6)', async () => {
    await render(
      <PoiCard poi={makePoi()}>
        <Text>slot-4.5</Text>
      </PoiCard>,
    );
    expect(screen.getByText('slot-4.5')).toBeOnTheScreen();
  });
});
