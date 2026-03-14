import { HttpExceptionFilter } from './http-exception.filter.js'
import {
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'

const createMockHost = () => {
  const mockJson = jest.fn()
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson })
  const mockResponse = { status: mockStatus }
  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
    }),
  } as unknown as ArgumentsHost
  return { mockHost, mockStatus, mockJson }
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter

  beforeEach(() => {
    filter = new HttpExceptionFilter()
  })

  it('handles NotFoundException with 404 status and { error: { code, message } } body', () => {
    const { mockHost, mockStatus, mockJson } = createMockHost()
    const exception = new NotFoundException('Resource not found')

    filter.catch(exception, mockHost)

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
    expect(mockJson).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    })
  })

  it('handles BadRequestException with 400 status and { error: { code, message } } body', () => {
    const { mockHost, mockStatus, mockJson } = createMockHost()
    filter.catch(new BadRequestException('Invalid input'), mockHost)
    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(mockJson).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'Invalid input' },
    })
  })

  it('handles HttpException with string response in { error: { code, message } } body', () => {
    const { mockHost, mockJson } = createMockHost()
    const exception = new HttpException('Custom error', HttpStatus.FORBIDDEN)

    filter.catch(exception, mockHost)

    expect(mockJson).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Custom error' },
    })
  })

  it('handles unknown non-HttpException with 500 status and INTERNAL_SERVER_ERROR code', () => {
    const { mockHost, mockStatus, mockJson } = createMockHost()
    filter.catch(new Error('Unexpected failure'), mockHost)

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(mockJson).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    })
  })
})
