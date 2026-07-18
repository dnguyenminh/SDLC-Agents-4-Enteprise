/**
 * OfflineQueue — Queues file upload payloads when backend is unreachable.
 * Drains automatically when backend reconnects.
 */

import { IOfflineQueue, FileUploadPayload, UploadResult } from "./models";
import { CodeIntelUploader } from "./CodeIntelUploader";

/** Max queued items to prevent unbounded memory growth */
const MAX_QUEUE_SIZE = 1000;

export class OfflineQueue implements IOfflineQueue {
  private queue: FileUploadPayload[] = [];
  private draining = false;

  constructor(private readonly uploader: CodeIntelUploader) {}

  /** Number of pending items in the queue */
  get pending(): number {
    return this.queue.length;
  }

  /** Add files to the offline queue */
  enqueue(files: FileUploadPayload[]): void {
    for (const file of files) {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        this.queue.shift(); // drop oldest to stay within limit
      }
      this.queue.push(file);
    }
  }

  /** Drain the queue by uploading all pending items */
  async drain(): Promise<void> {
    if (this.draining || this.queue.length === 0) { return; }
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, 100);
        const result = await this.uploader.uploadBatch(batch);
        if (result.errors.length > 0 && result.accepted === 0) {
          // Backend still unreachable — re-queue and stop
          this.queue.unshift(...batch);
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** Check if queue is currently draining */
  get isDraining(): boolean {
    return this.draining;
  }

  /** Clear all pending items */
  clear(): void {
    this.queue = [];
  }
}
