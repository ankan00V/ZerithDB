import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { DbClient } from "../../packages/db/src/db-client.js";
import { MockIpfsProvider, DefaultIpfsProvider } from "../../packages/db/src/ipfs.js";

describe("DbClient — IPFS/Filecoin Large Blob Integration", () => {
  let db: DbClient;
  let mockProvider: MockIpfsProvider;
  let currentAppId: string;

  beforeEach(() => {
    currentAppId = "test-ipfs-db-" + Math.random().toString(36).slice(2);
    mockProvider = new MockIpfsProvider();
    db = new DbClient({
      appId: currentAppId,
      ipfs: {
        enabled: true,
        sizeThreshold: 100, // 100 bytes threshold
        provider: mockProvider,
      },
    });
  });

  afterEach(async () => {
    await db.dispose();
    const req = indexedDB.deleteDatabase(`zerithdb_${currentAppId}`);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it("should store a small Uint8Array locally without IPFS offloading if size is under threshold", async () => {
    const col = db.collection<{ title: string; file: Uint8Array }>("assets");
    const smallContent = new Uint8Array([1, 2, 3]);

    const result = await col.insert({
      title: "small-doc",
      file: smallContent,
    });

    // Verify it wasn't uploaded to mock IPFS
    expect(mockProvider.getRawStorage().size).toBe(0);

    // Retrieve and verify contents are intact
    const fetched = await col.findById(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("small-doc");
    expect(fetched?.file).toBeInstanceOf(Uint8Array);
    expect(fetched?.file[0]).toBe(1);
    expect(fetched?.file[2]).toBe(3);
  });

  it("should offload a Blob to IPFS if size is above threshold and transparently restore it", async () => {
    const col = db.collection<{ title: string; file: Blob }>("assets");

    // Create a 150-byte blob (above 100-byte threshold)
    const largeContent = "a".repeat(150);
    const largeBlob = new Blob([largeContent], { type: "text/html" });

    const result = await col.insert({
      title: "large-doc",
      file: largeBlob,
    });

    // Verify it WAS uploaded to mock IPFS
    expect(mockProvider.getRawStorage().size).toBe(1);

    // Check stored CID prefix
    const cids = Array.from(mockProvider.getRawStorage().keys());
    expect(cids[0]).toContain("bafybeicmockipfs");

    // Fetch and check that it transparently downloaded and reconstructed the original Blob
    const fetched = await col.findById(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("large-doc");
    expect(fetched?.file).toBeInstanceOf(Blob);
    expect(fetched?.file.type).toBe("text/html");
    expect(fetched?.file.size).toBe(150);

    const restoredText = await fetched?.file.text();
    expect(restoredText).toBe(largeContent);
  });

  it("should offload a Uint8Array to IPFS if above threshold and transparently restore it", async () => {
    const col = db.collection<{ title: string; data: Uint8Array }>("binary");

    // Create a 120-byte Uint8Array (above threshold)
    const largeBytes = new Uint8Array(120);
    largeBytes.fill(42); // fill with 42s

    const result = await col.insert({
      title: "bytes-doc",
      data: largeBytes,
    });

    expect(mockProvider.getRawStorage().size).toBe(1);

    const fetched = await col.findById(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("bytes-doc");
    expect(fetched?.data).toBeInstanceOf(Uint8Array);
    expect(fetched?.data.length).toBe(120);
    expect(fetched?.data[0]).toBe(42);
    expect(fetched?.data[119]).toBe(42);
  });

  it("should use local cache on subsequent accesses and allow clearing the cache", async () => {
    const col = db.collection<{ title: string; file: Uint8Array }>("assets");
    const largeContent = new Uint8Array(150);
    largeContent.fill(5);

    const result = await col.insert({
      title: "cached-doc",
      file: largeContent,
    });

    // 1st Fetch: Will download from IPFS provider and cache locally
    const fetched1 = await col.findById(result.id);
    expect(fetched1).toBeDefined();

    // Modify the mock provider's storage to throw error if accessed again
    // This proves subsequent reads come from the local cache instead of mock IPFS!
    mockProvider.getRawStorage().clear();

    // 2nd Fetch: Should succeed cleanly by hitting local IndexedDB cache
    const fetched2 = await col.findById(result.id);
    expect(fetched2).toBeDefined();
    expect(fetched2?.file).toBeInstanceOf(Uint8Array);
    expect(fetched2?.file[0]).toBe(5);

    // Now clear the database IPFS cache
    await db.clearIpfsCache();

    // 3rd Fetch: Should fail because cache is empty and provider has no CID data
    await expect(col.findById(result.id)).rejects.toThrow();
  });

  it("should deduplicate concurrent fetches for the same CID to prevent duplicate downloads", async () => {
    const col = db.collection<{ title: string; file: Blob }>("assets");
    const largeContent = "c".repeat(150);
    const largeBlob = new Blob([largeContent]);

    const result = await col.insert({
      title: "shared-doc",
      file: largeBlob,
    });

    let fetchCount = 0;
    const trackingProvider = {
      upload: async (data: Blob | Uint8Array) => mockProvider.upload(data),
      fetch: async (cid: string) => {
        fetchCount++;
        // Add artificial latency to test concurrency window
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mockProvider.fetch(cid);
      },
    };

    // Reconfigure DB client with tracking provider
    const concurrentDb = new DbClient({
      appId: currentAppId + "-concurrent",
      ipfs: {
        enabled: true,
        sizeThreshold: 100,
        provider: trackingProvider,
      },
    });

    const concurrentCol = concurrentDb.collection<{ title: string; file: Blob }>("assets");
    const insertRes = await concurrentCol.insert({
      title: "shared-doc",
      file: largeBlob,
    });

    // Run parallel finds for the same document/CID
    const [doc1, doc2, doc3] = await Promise.all([
      concurrentCol.findById(insertRes.id),
      concurrentCol.findById(insertRes.id),
      concurrentCol.findById(insertRes.id),
    ]);

    expect(doc1).toBeDefined();
    expect(doc2).toBeDefined();
    expect(doc3).toBeDefined();

    // Fetch count should be exactly 1 because the other concurrent requests reused the active download promise!
    expect(fetchCount).toBe(1);

    await concurrentDb.dispose();
  });

  it("should automatically offload new files in update specs recursively", async () => {
    const col = db.collection<{ title: string; file?: Blob }>("assets");
    const result = await col.insert({
      title: "update-doc",
    });

    // Update with a large Blob
    const largeBlob = new Blob(["d".repeat(150)]);
    await col.update({ title: "update-doc" }, { $set: { file: largeBlob } });

    // Verify it uploaded to IPFS
    expect(mockProvider.getRawStorage().size).toBe(1);

    // Retrieve and verify
    const fetched = await col.findById(result.id);
    expect(fetched?.file).toBeInstanceOf(Blob);
    const text = await fetched?.file?.text();
    expect(text).toBe("d".repeat(150));
  });

  it("should delete documents without querying the IPFS provider", async () => {
    const col = db.collection<{ title: string; file: Blob }>("assets");
    const result = await col.insert({
      title: "delete-doc",
      file: new Blob(["e".repeat(150)]),
    });

    // Clear provider storage completely so fetching would throw
    mockProvider.getRawStorage().clear();

    // Delete should succeed because it queries raw document without restoring IPFS refs
    const count = await col.delete({ title: "delete-doc" });
    expect(count).toBe(1);

    const fetched = await col.findById(result.id);
    expect(fetched).toBeUndefined();
  });

  it("should safely handle circular/cyclic references without causing stack overflow", async () => {
    const col = db.collection<any>("assets");

    // Create an object with cyclic dependency
    const document: any = {
      title: "circular-doc",
      nested: {
        value: "hello",
      },
    };
    document.nested.parent = document; // Cyclic self-reference!

    const result = await col.insert(document);
    expect(result.id).toBeDefined();

    // Verify retrieval succeeds cleanly and retains the cycle safely
    const fetched = await col.findById(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.nested?.value).toBe("hello");
    expect(fetched?.nested?.parent).toBeDefined();
  });

  it("should handle offloading and reconstruction in deeply nested document structures", async () => {
    const col = db.collection<any>("assets");

    // Create deeply nested data structure containing a large binary file at the deep leaves
    const largeContent = new Uint8Array(120);
    largeContent.fill(99);

    const document = {
      level1: {
        array1: [
          {
            level2: {
              data: largeContent,
              unrelated: "stay-here",
            },
          },
        ],
      },
      flag: true,
    };

    const result = await col.insert(document);
    expect(mockProvider.getRawStorage().size).toBe(1);

    const fetched = await col.findById(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.flag).toBe(true);
    expect(fetched?.level1?.array1[0]?.level2?.unrelated).toBe("stay-here");
    expect(fetched?.level1?.array1[0]?.level2?.data).toBeInstanceOf(Uint8Array);
    expect(fetched?.level1?.array1[0]?.level2?.data[0]).toBe(99);
    expect(fetched?.level1?.array1[0]?.level2?.data.length).toBe(120);
  });

  it("should not modify or corrupt primitives, empty/null values, or non-binary structures", async () => {
    const col = db.collection<any>("assets");

    const document = {
      title: "primitives-doc",
      emptyArray: [],
      nullValue: null,
      undefinedValue: undefined,
      num: 42,
      bool: false,
    };

    const result = await col.insert(document);
    expect(mockProvider.getRawStorage().size).toBe(0); // Nothing uploaded

    const fetched = await col.findById(result.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("primitives-doc");
    expect(fetched?.emptyArray).toEqual([]);
    expect(fetched?.nullValue).toBeNull();
    expect(fetched?.num).toBe(42);
    expect(fetched?.bool).toBe(false);
  });

  it("should verify DefaultIpfsProvider network failures handle exponential backoff retries and fail on client errors", async () => {
    const originalFetch = globalThis.fetch;
    let fetchAttempts = 0;

    const provider = new DefaultIpfsProvider(
      "http://mock-ipfs-node:5001",
      "https://ipfs.io/ipfs/",
      1
    );

    try {
      // 1. Test Transient Failures (first 2 fail, 3rd succeeds)
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchAttempts++;
        if (fetchAttempts < 3) {
          throw new TypeError("Failed to fetch (Transient network issue)");
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ Hash: "bafybeicmockipfsresolvedhash" }),
          blob: async () => new Blob(["test-data-returned"]),
        } as Response;
      }) as any;

      const cid = await provider.upload(new Uint8Array([1, 2, 3]));
      expect(cid).toBe("bafybeicmockipfsresolvedhash");
      expect(fetchAttempts).toBe(3); // 2 failed, 3rd succeeded!

      // 2. Test Client Error (e.g. 404 should throw immediately without retrying)
      fetchAttempts = 0;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchAttempts++;
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
        } as Response;
      }) as any;

      await expect(provider.upload(new Uint8Array([1, 2, 3]))).rejects.toThrow(/HTTP Error 404/);
      expect(fetchAttempts).toBe(1); // 404 is non-transient, should abort immediately!
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
