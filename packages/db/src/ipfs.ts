import type { IpfsProvider } from "zerithdb-core";

export interface IpfsReference {
  _type: "zerithdb.ipfs-ref";
  cid: string;
  size: number;
  mimeType?: string;
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
 */
export async function uploadLargeFiles(
  obj: any,
  sizeThreshold: number,
  uploadFn: (data: Blob | Uint8Array) => Promise<string>
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

  if (Array.isArray(obj)) {
    const nextArr = [];
    for (const item of obj) {
      nextArr.push(await uploadLargeFiles(item, sizeThreshold, uploadFn));
    }
    return nextArr;
  }

  if (typeof obj === "object") {
    const proto = Object.getPrototypeOf(obj);
    if (proto === null || proto === Object.prototype) {
      const nextObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        nextObj[k] = await uploadLargeFiles(v, sizeThreshold, uploadFn);
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
 */
export async function downloadLargeFiles(
  obj: any,
  fetchFn: (cid: string) => Promise<Blob>,
  cacheGet: (cid: string) => Promise<Blob | Uint8Array | undefined>,
  cacheSet: (cid: string, data: Blob | Uint8Array) => Promise<void>
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

  if (Array.isArray(obj)) {
    const nextArr = [];
    for (const item of obj) {
      nextArr.push(await downloadLargeFiles(item, fetchFn, cacheGet, cacheSet));
    }
    return nextArr;
  }

  if (typeof obj === "object") {
    const proto = Object.getPrototypeOf(obj);
    if (proto === null || proto === Object.prototype) {
      const nextObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        nextObj[k] = await downloadLargeFiles(v, fetchFn, cacheGet, cacheSet);
      }
      return nextObj;
    }
  }

  return obj;
}

/**
 * Standard implementation of IpfsProvider that talks to a standard IPFS HTTP API node
 * and fetches from an IPFS HTTP gateway.
 */
export class DefaultIpfsProvider implements IpfsProvider {
  constructor(
    private readonly apiUrl: string = "http://localhost:5001",
    private readonly gatewayUrl: string = "https://ipfs.io/ipfs/"
  ) {}

  async upload(data: Blob | Uint8Array): Promise<string> {
    const formData = new FormData();
    const blob = data instanceof Blob ? data : new Blob([data as any]);
    formData.append("file", blob, "file");

    const url = new URL("/api/v0/add", this.apiUrl);
    url.searchParams.set("cid-version", "1");

    const res = await fetch(url.toString(), {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`IPFS upload failed with status ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    if (!json.Hash) {
      throw new Error("IPFS upload response did not return a Hash");
    }
    return json.Hash;
  }

  async fetch(cid: string): Promise<Blob> {
    const gateway = this.gatewayUrl.endsWith("/") ? this.gatewayUrl : `${this.gatewayUrl}/`;
    const res = await fetch(`${gateway}${cid}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch IPFS data for CID ${cid}: ${res.status} ${res.statusText}`);
    }
    return await res.blob();
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
