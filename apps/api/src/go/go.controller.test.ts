import { BadRequestException } from '@nestjs/common'
import { GoController } from './go.controller.js'

function mockResponse() {
  const set = jest.fn().mockReturnThis()
  const redirect = jest.fn()
  const res = { set, redirect } as never
  return { res, set, redirect }
}

describe('GoController', () => {
  let controller: GoController

  beforeEach(() => {
    controller = new GoController()
  })

  describe('redirectBooking', () => {
    it('redirects 302 to a valid Booking URL', () => {
      const { res, redirect } = mockResponse()
      const url = 'https://www.booking.com/searchresults.html?ss=Pamplona'

      controller.redirectBooking(url, res)

      expect(redirect).toHaveBeenCalledWith(302, url)
    })

    it('sets Cache-Control: no-store header', () => {
      const { res, set } = mockResponse()
      const url = 'https://www.booking.com/searchresults.html?ss=Toulouse'

      controller.redirectBooking(url, res)

      expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store')
    })

    it('throws BadRequestException for non-Booking URL', () => {
      const { res, redirect } = mockResponse()

      expect(() => controller.redirectBooking('https://evil.com/phishing', res)).toThrow(
        BadRequestException,
      )
      expect(redirect).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when url param is missing', () => {
      const { res } = mockResponse()

      expect(() => controller.redirectBooking(undefined as unknown as string, res)).toThrow(
        BadRequestException,
      )
    })

    it('throws BadRequestException for empty string', () => {
      const { res } = mockResponse()

      expect(() => controller.redirectBooking('', res)).toThrow(BadRequestException)
    })

    it('throws BadRequestException for http (non-https) Booking URL', () => {
      const { res } = mockResponse()

      expect(() =>
        controller.redirectBooking('http://www.booking.com/searchresults.html?ss=Test', res),
      ).toThrow(BadRequestException)
    })

    it('throws BadRequestException for subdomain-based bypass attempt', () => {
      const { res } = mockResponse()

      expect(() =>
        controller.redirectBooking('https://www.booking.com.evil.com/phishing', res),
      ).toThrow(BadRequestException)
    })

    it('accepts Booking URL with path and query params', () => {
      const { res, redirect } = mockResponse()
      const url =
        'https://www.booking.com/searchresults.html?latitude=43.5&longitude=1.4&dest_type=latlong'

      controller.redirectBooking(url, res)

      expect(redirect).toHaveBeenCalledWith(302, url)
    })
  })
})
