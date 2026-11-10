/**
 * SA4E-406 — minimal binary min-heap keyed by a numeric priority.
 * Used by the orthogonal grid router (A* open set).
 */
export class MinHeap<T> {
  private readonly items: Array<{ key: number; value: T }> = [];

  get size(): number { return this.items.length; }

  /** Insert `value` with priority `key` (lower pops first). */
  push(key: number, value: T): void {
    this.items.push({ key, value });
    this.siftUp(this.items.length - 1);
  }

  /** Remove and return the lowest-priority value, or undefined when empty. */
  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top || !last) return top?.value;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top.value;
  }

  private siftUp(start: number): void {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].key <= this.items[i].key) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(start: number): void {
    let i = start;
    for (;;) {
      const smallest = this.smallestOf(i);
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private smallestOf(i: number): number {
    const l = 2 * i + 1, r = l + 1;
    let s = i;
    if (l < this.items.length && this.items[l].key < this.items[s].key) s = l;
    if (r < this.items.length && this.items[r].key < this.items[s].key) s = r;
    return s;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
  }
}
