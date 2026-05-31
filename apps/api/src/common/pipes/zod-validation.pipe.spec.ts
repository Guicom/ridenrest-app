import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { ZodValidationPipe } from './zod-validation.pipe.js'

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string(), age: z.number().int().min(0) })
  const pipe = new ZodValidationPipe(schema)

  it('returns parsed data on valid input', () => {
    expect(pipe.transform({ name: 'Bob', age: 42 })).toEqual({ name: 'Bob', age: 42 })
  })

  it('throws BadRequestException on invalid input', () => {
    expect(() => pipe.transform({ name: 'Bob', age: -1 })).toThrow(BadRequestException)
  })

  it('includes a structured errors array in the exception body', () => {
    try {
      pipe.transform({ age: 'nope' })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException)
      const body = (err as BadRequestException).getResponse() as {
        message: string
        errors: { path: string; message: string }[]
      }
      expect(body.message).toBe('Validation failed')
      expect(Array.isArray(body.errors)).toBe(true)
      expect(body.errors.length).toBeGreaterThan(0)
      expect(body.errors.some((e) => e.path === 'name')).toBe(true)
    }
  })
})
