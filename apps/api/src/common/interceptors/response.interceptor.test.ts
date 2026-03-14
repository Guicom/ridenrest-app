import { ResponseInterceptor } from './response.interceptor.js'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { of } from 'rxjs'

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>

  beforeEach(() => {
    interceptor = new ResponseInterceptor()
  })

  it('wraps object response in { data: ... }', (done) => {
    const mockCallHandler: CallHandler = {
      handle: () => of({ name: 'adventure', id: '123' }),
    }

    interceptor
      .intercept({} as ExecutionContext, mockCallHandler)
      .subscribe((result) => {
        expect(result).toEqual({ data: { name: 'adventure', id: '123' } })
        done()
      })
  })

  it('wraps string response in { data: ... }', (done) => {
    const mockCallHandler: CallHandler = {
      handle: () => of('Hello World!'),
    }

    interceptor
      .intercept({} as ExecutionContext, mockCallHandler)
      .subscribe((result) => {
        expect(result).toEqual({ data: 'Hello World!' })
        done()
      })
  })

  it('wraps array response in { data: ... }', (done) => {
    const mockCallHandler: CallHandler = {
      handle: () => of([{ id: 1 }, { id: 2 }]),
    }

    interceptor
      .intercept({} as ExecutionContext, mockCallHandler)
      .subscribe((result) => {
        expect(result).toEqual({ data: [{ id: 1 }, { id: 2 }] })
        done()
      })
  })
})
