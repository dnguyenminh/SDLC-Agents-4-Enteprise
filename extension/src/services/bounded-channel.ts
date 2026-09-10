/**
 * bounded-channel.ts — A single-producer / multi-consumer async channel with
 * backpressure, used to pipeline Pega rule fetch (supplier) and ingest (consumers).
 *
 * Why: previously the BFS loop fetched a batch, then ingested that batch serially,
 * leaving the network/CPU idle on round-trips. This channel lets the supplier keep
 * fetching while consumers ingest concurrently, without unbounded memory growth.
 *
 * Backpressure: `push` blocks (awaits) when the buffer is full, so the supplier
 * cannot outrun the consumers and inflate RAM. `take` blocks when the buffer is
 * empty until an item arrives or the channel is closed.
 *
 * Not for concurrent producers: designed for exactly one producer. Multiple
 * consumers are safe because each `take` resolves exactly one waiter with one item.
 */

/** A bounded FIFO channel decoupling one producer from N consumers. */
export class BoundedChannel<T> {
  private readonly buffer: T[] = [];
  private closed = false;

  /** Consumers parked on an empty buffer, waiting for the next item. */
  private readonly takeWaiters: Array<(value: IteratorResult<T>) => void> = [];
  /** Producer parked on a full buffer, waiting for capacity to free up. */
  private readonly pushWaiters: Array<() => void> = [];

  /**
   * @param capacity Max buffered items before `push` applies backpressure.
   *   Must be >= 1; smaller values tighten memory at the cost of throughput.
   */
  constructor(private readonly capacity: number) {
    // Guard: a zero/negative capacity would deadlock the producer immediately.
    if (capacity < 1) { throw new Error(`BoundedChannel capacity must be >= 1, got ${capacity}`); }
  }

  /**
   * Enqueue an item, awaiting if the buffer is at capacity (backpressure).
   * @throws Error if the channel is already closed (producer bug).
   */
  async push(item: T): Promise<void> {
    if (this.closed) { throw new Error("push on a closed BoundedChannel"); }

    // Hand off directly to a parked consumer when one is waiting (skip the buffer).
    const waiter = this.takeWaiters.shift();
    if (waiter) { waiter({ value: item, done: false }); return; }

    if (this.buffer.length < this.capacity) { this.buffer.push(item); return; }

    // Buffer full → park the producer until a consumer frees a slot.
    await new Promise<void>((resolve) => this.pushWaiters.push(resolve));
    this.buffer.push(item);
  }

  /**
   * Dequeue the next item. Resolves `{ done: true }` when the channel is closed
   * AND drained, signalling consumers to stop.
   */
  async take(): Promise<IteratorResult<T>> {
    const item = this.buffer.shift();
    if (item !== undefined) {
      // A slot freed up → wake one parked producer (if any).
      this.pushWaiters.shift()?.();
      return { value: item, done: false };
    }

    if (this.closed) { return { value: undefined as unknown as T, done: true }; }

    // Buffer empty and open → park this consumer until push() or close().
    return new Promise<IteratorResult<T>>((resolve) => this.takeWaiters.push(resolve));
  }

  /**
   * Close the channel. Wakes all parked consumers with `{ done: true }` once the
   * buffer drains. Idempotent.
   */
  close(): void {
    if (this.closed) { return; }
    this.closed = true;
    // Only consumers parked on an EMPTY buffer need waking; buffered items are
    // still delivered by take() before it reports done.
    if (this.buffer.length === 0) {
      let waiter = this.takeWaiters.shift();
      while (waiter) {
        waiter({ value: undefined as unknown as T, done: true });
        waiter = this.takeWaiters.shift();
      }
    }
  }
}
