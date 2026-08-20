import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { NearMissNotice } from './near-miss-notice'

afterEach(() => {
  // Vitest sans `globals: true` → l'auto-cleanup de RTL n'est pas enregistré.
  cleanup()
})

describe('NearMissNotice', () => {
  it('n’affiche rien quand rien n’a été masqué', () => {
    const { container } = render(
      <NearMissNotice count={0} nearestM={null} corridorWidthM={3000} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('annonce le nombre masqué, le seuil et le plus proche', () => {
    // Cas réel : un camping à 3 263 m écarté pour 263 m, sans que rien ne l'indique.
    render(<NearMissNotice count={2} nearestM={3263} corridorWidthM={3000} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('2 résultats au-delà de 3,0 km de la trace ne sont pas affichés')
    expect(note).toHaveTextContent('le plus proche à 3,3 km')
  })

  it('accorde le singulier', () => {
    render(<NearMissNotice count={1} nearestM={3100} corridorWidthM={3000} />)
    expect(screen.getByRole('note')).toHaveTextContent('1 résultat au-delà')
  })

  it('lit le seuil renvoyé par le serveur, sans le redéclarer', () => {
    render(<NearMissNotice count={1} nearestM={5200} corridorWidthM={5000} />)
    expect(screen.getByRole('note')).toHaveTextContent('au-delà de 5,0 km')
  })

  it('reste lisible sans distance du plus proche', () => {
    render(<NearMissNotice count={3} nearestM={null} corridorWidthM={3000} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('3 résultats')
    expect(note.textContent).not.toContain('le plus proche')
  })

  it('affiche les courtes distances en mètres', () => {
    render(<NearMissNotice count={1} nearestM={3263} corridorWidthM={800} />)
    expect(screen.getByRole('note')).toHaveTextContent('au-delà de 800 m')
  })
})
