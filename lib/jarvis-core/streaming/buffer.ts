/**
 * JARVIS CORE V2 — STREAM EVENT REPLAY BUFFER
 * 
 * Checkpoint: C16 (Section C16.3)
 * Status: Authoritative Monotonic Replay Buffer
 * 
 * Architectural Invariants:
 * 1. Monotonic IDs: Every event pushed receives next sequence number id: 1, 2, 3...
 * 2. Reconnection Replay: Client sending `Last-Event-ID: N` can retrieve all events since N.
 * 3. Bounded Memory: Old events evicted when capacity is reached.
 */

import type { CoreStreamEvent, CoreStreamEventType } from "./types"

export class EventReplayBuffer {
  private nextId: number = 1
  private readonly buffer: CoreStreamEvent[] = []
  private readonly capacity: number

  constructor(capacity: number = 200) {
    this.capacity = capacity
  }

  /**
   * Push a new event to the buffer, assigning a monotonic ID and timestamp.
   */
  public push<T>(
    eventData: { event: CoreStreamEventType; data: T; timestamp?: number }
  ): CoreStreamEvent<T> {
    const event: CoreStreamEvent<T> = {
      id: this.nextId++,
      event: eventData.event,
      timestamp: eventData.timestamp ?? Date.now(),
      data: eventData.data,
    }

    this.buffer.push(event as CoreStreamEvent)
    if (this.buffer.length > this.capacity) {
      this.buffer.shift()
    }

    return event
  }

  /**
   * Retrieve all events emitted after lastEventId.
   */
  public getEventsSince(lastEventId: number): ReadonlyArray<CoreStreamEvent> {
    return this.buffer.filter((e) => e.id > lastEventId)
  }

  /**
   * Get full history in buffer.
   */
  public getAllEvents(): ReadonlyArray<CoreStreamEvent> {
    return [...this.buffer]
  }

  /**
   * Current highest event sequence ID.
   */
  public getCurrentId(): number {
    return this.nextId - 1
  }

  /**
   * Clear the replay buffer.
   */
  public clear(): void {
    this.buffer.length = 0
  }
}
