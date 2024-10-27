import { sleep } from '../utils/common';
import { FIRST_SEGMENT_INDEX } from '../utils/constants';
import { incrementHexString } from '../utils/operations';

export class AsyncQueue {
  private indexed;
  private waitable;
  private clearWaitTime;
  private isProcessing = false;
  private currentPromiseProcessing = false;
  private index = FIRST_SEGMENT_INDEX;
  private queue: ((index?: string) => Promise<void>)[] = [];

  constructor(settings: { indexed?: boolean; waitable?: boolean; clearWaitTime?: number } = {}) {
    this.indexed = settings.indexed || false;
    this.waitable = settings.waitable || false;
    this.clearWaitTime = settings.clearWaitTime || 100;
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.currentPromiseProcessing = true;
      const promise = this.queue.shift()!;
      const action = this.indexed ? () => promise(this.index) : () => promise();

      if (this.waitable) {
        try {
          await action();
          this.index = incrementHexString(this.index);
        } catch (error) {
          console.error('Error processing promise:', error);
          throw error;
        } finally {
          this.currentPromiseProcessing = false;
        }
      } else {
        action()
          .then(() => {
            this.index = incrementHexString(this.index);
          })
          .catch((error) => {
            console.error('Error processing promise:', error);
          })
          .finally(() => {
            this.currentPromiseProcessing = false;
          });
      }
    }

    this.isProcessing = false;
  }

  enqueue(promiseFunction: (index?: string) => Promise<any>) {
    this.queue.push(promiseFunction);
    this.processQueue();
  }

  async clearQueue() {
    this.queue = [];
    while (this.isProcessing || this.currentPromiseProcessing) {
      await sleep(this.clearWaitTime);
    }
  }
}
