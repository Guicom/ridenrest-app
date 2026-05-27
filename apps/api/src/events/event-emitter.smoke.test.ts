import { Test } from '@nestjs/testing'
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter'

describe('EventEmitter smoke test', () => {
  it('emits and handles events', async () => {
    const mod = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
    }).compile()

    const emitter = mod.get(EventEmitter2)
    const handler = jest.fn()
    emitter.on('test.event', handler)
    emitter.emit('test.event', { foo: 'bar' })

    expect(handler).toHaveBeenCalledWith({ foo: 'bar' })

    await mod.close()
  })
})
