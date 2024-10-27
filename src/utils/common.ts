export function padTo2Digits(num: number) {
  return num.toString().padStart(2, '0');
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function remove0xPrefix(value: string) {
  if (value.startsWith('0x')) {
    return value.substring(2);
  }
  return value;
}

export function retryAsync<T>(fn: () => Promise<T>, retries: number = 3, delay: number = 250): void {
  fn().catch((error) => {
    if (retries > 0) {
      console.log(`Retrying... Attempts left: ${retries}. Error: ${error.message}`);
      setTimeout(() => retryAsync(fn, retries - 1, delay), delay);
    } else {
      console.error(`Failed after ${retries} initial attempts. Last error: ${error.message}`);
    }
  });
}

export async function retryAwaitableAsync<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 250,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn()
      .then(resolve)
      .catch((error) => {
        if (retries > 0) {
          console.log(`Retrying... Attempts left: ${retries}. Error: ${error.message}`);
          setTimeout(() => {
            retryAwaitableAsync(fn, retries - 1, delay)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          console.error(`Failed after ${retries} initial attempts. Last error: ${error.message}`);
          reject(error);
        }
      });
  });
}
