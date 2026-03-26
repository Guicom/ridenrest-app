import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AuthPageWrapper } from './auth-page-wrapper'

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

vi.mock('./marketing-header', () => ({
  MarketingHeader: () => null,
}))

describe('AuthPageWrapper', () => {
  afterEach(() => cleanup())

  it('renders children inside the card', () => {
    render(
      <AuthPageWrapper>
        <p>Test content</p>
      </AuthPageWrapper>
    )
    expect(screen.getByText('Test content')).toBeTruthy()
  })

  it('renders the hero background image', () => {
    const { container } = render(
      <AuthPageWrapper>
        <p>Content</p>
      </AuthPageWrapper>
    )
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toContain('hero.webp')
  })

  it('renders the dark overlay', () => {
    const { container } = render(
      <AuthPageWrapper>
        <p>Content</p>
      </AuthPageWrapper>
    )
    const overlay = container.querySelector('.bg-black\\/50')
    expect(overlay).toBeTruthy()
  })

  it('renders children inside the white card', () => {
    const { container } = render(
      <AuthPageWrapper>
        <p>Card content</p>
      </AuthPageWrapper>
    )
    const card = container.querySelector('.rounded-2xl')
    expect(card).toBeTruthy()
    expect(card?.classList.contains('shadow-sm')).toBe(true)
    expect(card?.textContent).toContain('Card content')
  })
})
