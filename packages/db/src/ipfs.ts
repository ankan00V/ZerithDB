import type { IpfsProvider } from "zerithdb-core";

/**
 * Represents a lightweight decentralized pointer (reference) for a large file offloaded to IPFS/Filecoin.
 *
 * These references are transparently created when binary files (Blobs or Uint8Arrays) exceeding the size
 * threshold are inserted into collections. They are subsequently resolved and reconstructed lazily upon
 * document retrieval.
 */
export interface IpfsReference {
  /**
   * Constant type tag to identify the object as an IPFS reference pointer within ZerithDB documents.
   */
  _type: "zerithdb.ipfs-ref";
  /**
   * The Content Identifier (CID) returned by the IPFS node/network for the uploaded resource.
   */
  cid: string;
  /**
   * The original file size/byte length in bytes. Used for metadata and validation checking.
   */
  size: number;
  /**
   * Optional MIME media type of the original file (only populated if the original value was a Blob with a defined type).
   */
  mimeType?: string;
  /**
   * The original Javascript data type structure to guarantee that the binary is correctly restored
   * back to its exact original class instance (`Blob` or `Uint8Array`).
   */
  originalType: "Blob" | "Uint8Array";
}

/**
 * Type guard to check if an object is an IPFS reference.
 */
export function isIpfsReference(obj: any): obj is IpfsReference {
  return (
    obj !== null &&
    typeof obj === "object" &&
    obj._type === "zerithdb.ipfs-ref" &&
    typeof obj.cid === "string" &&
    typeof obj.originalType === "string"
  );
}

/**
 * Recursively traverses a document to find Blobs or Uint8Arrays above the size threshold,
 * uploads them via the provided upload function, and replaces them with IpfsReferences.
 *
 * Designed with high performance and cyclic dependency checks.
 */
export async function uploadLargeFiles(
  obj: any,
  sizeThreshold: number,
  uploadFn: (data: Blob | Uint8Array) => Promise<string>,
  seen: WeakSet<any> = new WeakSet()
): Promise<any> {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Blob) {
    if (obj.size >= sizeThreshold) {
      const cid = await uploadFn(obj);
      return {
        _type: "zerithdb.ipfs-ref",
        cid,
        size: obj.size,
        mimeType: obj.type,
        originalType: "Blob",
      } satisfies IpfsReference;
    }
    return obj;
  }

  if (obj instanceof Uint8Array) {
    if (obj.byteLength >= sizeThreshold) {
      const cid = await uploadFn(obj);
      return {
        _type: "zerithdb.ipfs-ref",
        cid,
        size: obj.byteLength,
        originalType: "Uint8Array",
      } satisfies IpfsReference;
    }
    return obj;
  }

  if (typeof obj === "object") {
    // Prevent infinite recursion loops from circular/cyclic references
    if (seen.has(obj)) {
      return obj;
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      const nextArr = [];
      for (const item of obj) {
        nextArr.push(await uploadLargeFiles(item, sizeThreshold, uploadFn, seen));
      }
      return nextArr;
    }

    const proto = Object.getPrototypeOf(obj);
    if (proto === null || proto === Object.prototype) {
      const nextObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        nextObj[k] = await uploadLargeFiles(v, sizeThreshold, uploadFn, seen);
      }
      return nextObj;
    }
  }

  return obj;
}

/**
 * Recursively traverses a retrieved document to find IpfsReferences, downloads
 * the corresponding files (using a cache-first strategy), and reconstructs the
 * original Blob or Uint8Array.
 *
 * Designed with high performance and cyclic dependency checks.
 */
export async function downloadLargeFiles(
  obj: any,
  fetchFn: (cid: string) => Promise<Blob>,
  cacheGet: (cid: string) => Promise<Blob | Uint8Array | undefined>,
  cacheSet: (cid: string, data: Blob | Uint8Array) => Promise<void>,
  seen: WeakSet<any> = new WeakSet()
): Promise<any> {
  if (obj === null || obj === undefined) return obj;

  if (isIpfsReference(obj)) {
    let data = await cacheGet(obj.cid);
    if (!data) {
      const blob = await fetchFn(obj.cid);
      if (obj.originalType === "Uint8Array") {
        const buffer = await blob.arrayBuffer();
        data = new Uint8Array(buffer);
      } else {
        data = obj.mimeType ? new Blob([blob], { type: obj.mimeType }) : blob;
      }
      await cacheSet(obj.cid, data);
    }
    return data;
  }

  if (typeof obj === "object") {
    // Prevent infinite recursion loops from circular/cyclic references
    if (seen.has(obj)) {
      return obj;
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      const nextArr = [];
      for (const item of obj) {
        nextArr.push(await downloadLargeFiles(item, fetchFn, cacheGet, cacheSet, seen));
      }
      return nextArr;
    }

    const proto = Object.getPrototypeOf(obj);
    if (proto === null || proto === Object.prototype) {
      const nextObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        nextObj[k] = await downloadLargeFiles(v, fetchFn, cacheGet, cacheSet, seen);
      }
      return nextObj;
    }
  }

  return obj;
}

/**
 * Standard implementation of IpfsProvider that talks to a standard IPFS HTTP API node
 * and fetches from an IPFS HTTP gateway.
 *
 * Features built-in automatic retries with exponential backoff for transient network issues.
 */
export class DefaultIpfsProvider implements IpfsProvider {
  constructor(
    private readonly apiUrl: string = "http://localhost:5001",
    private readonly gatewayUrl: string = "https://ipfs.io/ipfs/",
    private readonly retryDelay: number = 1000
  ) {}

  /**
   * Internal request helper carrying retry capabilities and exponential backoff
   */
  private async requestWithRetry(
    url: string,
    options: RequestInit,
    retries = 3,
    baseDelay = this.retryDelay
  ): Promise<Response> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return res;

        const err: any = new Error(`HTTP Error ${res.status}: ${res.statusText}`);
        if (res.status >= 400 && res.status < 500) {
          err.nonTransient = true;
        }
        throw err;
      } catch (err: any) {
        lastError = err;
        if (err.nonTransient) {
          throw err; // Abort immediately for non-transient client errors
        }
      }
      if (i < retries - 1) {
        const backoff = baseDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  }

  async upload(data: Blob | Uint8Array): Promise<string> {
    if (!data) {
      throw new Error("Cannot upload empty data to IPFS");
    }
    try {
      const formData = new FormData();
      const blob = data instanceof Blob ? data : new Blob([data as any]);
      formData.append("file", blob, "file");

      const url = new URL("/api/v0/add", this.apiUrl);
      url.searchParams.set("cid-version", "1");

      const res = await this.requestWithRetry(url.toString(), {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!json.Hash) {
        throw new Error("IPFS upload response did not return a Hash");
      }
      return json.Hash;
    } catch (err: any) {
      throw new Error(`IPFS upload failed: ${err.message}`);
    }
  }

  async fetch(cid: string): Promise<Blob> {
    if (!cid || typeof cid !== "string") {
      throw new Error("Invalid IPFS CID provided for fetch");
    }
    try {
      const gateway = this.gatewayUrl.endsWith("/") ? this.gatewayUrl : `${this.gatewayUrl}/`;
      const res = await this.requestWithRetry(`${gateway}${cid}`, {
        method: "GET",
      });
      return await res.blob();
    } catch (err: any) {
      throw new Error(`Failed to fetch IPFS data for CID ${cid}: ${err.message}`);
    }
  }
}

/**
 * Mock implementation of IpfsProvider for testing or standalone local operations.
 */
export class MockIpfsProvider implements IpfsProvider {
  private readonly storage = new Map<string, Blob>();
  private cidCounter = 0;

  async upload(data: Blob | Uint8Array): Promise<string> {
    const blob = data instanceof Blob ? data : new Blob([data as any]);
    const cid = `bafybeicmockipfs${this.cidCounter++}ref`;
    this.storage.set(cid, blob);
    return cid;
  }

  async fetch(cid: string): Promise<Blob> {
    const blob = this.storage.get(cid);
    if (!blob) {
      throw new Error(`CID ${cid} not found in Mock IPFS storage`);
    }
    return blob;
  }

  getRawStorage(): Map<string, Blob> {
    return this.storage;
  }
}
