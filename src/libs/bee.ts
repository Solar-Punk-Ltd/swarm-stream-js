import { Bee } from '@ethersphere/bee-js';

class BeeWrapper {
  private instance: Bee | null = null;

  public setBee(url: string): Bee {
    if (!this.instance) {
      this.instance = new Bee(url);
    }
    return this.instance;
  }

  public getBee(): Bee {
    if (!this.instance) {
      throw new Error('Bee instance is not set. Call setBee first.');
    }
    return this.instance;
  }

  public clearInstance(): void {
    this.instance = null;
  }
}

export default BeeWrapper;
