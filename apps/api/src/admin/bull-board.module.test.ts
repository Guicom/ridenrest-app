import type { Request, Response, NextFunction } from 'express'
import { bullBoardBasicAuth } from './bull-board.module.js'

function makeRes(): Response & { _status?: number; _headers: Record<string, string>; _body?: unknown } {
  const res = {
    _headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this._headers[k] = v
    },
    status(code: number) {
      this._status = code
      return this
    },
    send(body: unknown) {
      this._body = body
      return this
    },
  }
  return res as unknown as Response & { _status?: number; _headers: Record<string, string>; _body?: unknown }
}

function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

describe('bullBoardBasicAuth', () => {
  const ORIG_USER = process.env['BULL_BOARD_USER']
  const ORIG_PASS = process.env['BULL_BOARD_PASSWORD']

  afterEach(() => {
    process.env['BULL_BOARD_USER'] = ORIG_USER
    process.env['BULL_BOARD_PASSWORD'] = ORIG_PASS
    if (ORIG_USER === undefined) delete process.env['BULL_BOARD_USER']
    if (ORIG_PASS === undefined) delete process.env['BULL_BOARD_PASSWORD']
  })

  it('fail-closed (503) si aucune credential configurée — board monté sans auth = refusé', () => {
    delete process.env['BULL_BOARD_USER']
    delete process.env['BULL_BOARD_PASSWORD']
    const next = jest.fn()
    const res = makeRes()
    bullBoardBasicAuth({ headers: {} } as Request, res, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(503)
  })

  it('fail-closed (503) si une seule des deux credentials est configurée', () => {
    process.env['BULL_BOARD_USER'] = 'admin'
    delete process.env['BULL_BOARD_PASSWORD']
    const next = jest.fn()
    const res = makeRes()
    bullBoardBasicAuth({ headers: {} } as Request, res, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(503)
  })

  it('401 + WWW-Authenticate si creds configurées et header absent', () => {
    process.env['BULL_BOARD_USER'] = 'admin'
    process.env['BULL_BOARD_PASSWORD'] = 'secret'
    const next = jest.fn()
    const res = makeRes()
    bullBoardBasicAuth({ headers: {} } as Request, res, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(401)
    expect(res._headers['WWW-Authenticate']).toContain('Basic')
  })

  it('401 si credentials incorrectes', () => {
    process.env['BULL_BOARD_USER'] = 'admin'
    process.env['BULL_BOARD_PASSWORD'] = 'secret'
    const next = jest.fn()
    const res = makeRes()
    bullBoardBasicAuth(
      { headers: { authorization: basic('admin', 'wrong') } } as unknown as Request,
      res,
      next as NextFunction,
    )
    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(401)
  })

  it('next() si credentials correctes', () => {
    process.env['BULL_BOARD_USER'] = 'admin'
    process.env['BULL_BOARD_PASSWORD'] = 'secret'
    const next = jest.fn()
    bullBoardBasicAuth(
      { headers: { authorization: basic('admin', 'secret') } } as unknown as Request,
      makeRes(),
      next as NextFunction,
    )
    expect(next).toHaveBeenCalled()
  })
})
