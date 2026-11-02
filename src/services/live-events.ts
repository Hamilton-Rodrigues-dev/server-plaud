import { EventEmitter } from 'node:events'

export type LiveEvent =
  | { type: 'chunk'; text: string }
  | { type: 'assist'; kind: 'question' | 'statement'; text: string }

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function publishLive(roomId: string, event: LiveEvent) {
  bus.emit(roomId, event)
}

export function subscribeLive(
  roomId: string,
  listener: (event: LiveEvent) => void
) {
  bus.on(roomId, listener)

  return () => {
    bus.off(roomId, listener)
  }
}
