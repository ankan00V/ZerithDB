export class CapabilityBlocklist {
  private readonly entries = new Set<string>();

  revoke(nonce: string): void {
    this.entries.add(nonce);
  }

  async isRevoked(nonce: string): Promise<boolean> {
    return this.entries.has(nonce);
  }

  loadEntries(nonces: string[]): void {
    for (const n of nonces) this.entries.add(n);
  }

  exportEntries(): string[] {
    return [...this.entries];
  }

  get size(): number {
    return this.entries.size;
  }
}