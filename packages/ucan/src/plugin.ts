import type { SyncPlugin } from "zerithdb-core";
import { UCANVerifier } from "./verifier.js";
import type { CapabilityBlocklist } from "./blocklist.js";
import type { UCANAbility } from "./types.js";

export interface UCANPluginOptions {
  appId:            string;
  getTokenForPeer:  (peerDid: string) => string | null | undefined;
  requiredAbility?: UCANAbility;
  blocklist?:       CapabilityBlocklist;
}

export class UCANSyncPlugin implements SyncPlugin {
  readonly id      = "zerithdb-ucan-rbac";
  readonly version = 1;

  private readonly verifier = new UCANVerifier();
  private readonly options:  UCANPluginOptions;

  constructor(options: UCANPluginOptions) {
    this.options = { requiredAbility: "db/write", ...options };
  }

  async onBeforeApplyUpdate(
    collectionName: string,
    update:         Uint8Array,
    fromPeer:       string
  ): Promise<Uint8Array | null> {
    const encoded = this.options.getTokenForPeer(fromPeer);

    if (!encoded) {
      console.warn(`[UCAN] Rejected update from "${fromPeer}": no capability token found`);
      return null;
    }

    const result = await this.verifier.verify(encoded, {
      expectedAudience: fromPeer,
      resource:         `zerithdb://${this.options.appId}/${collectionName}`,
      requiredAbility:  this.options.requiredAbility ?? "db/write",
      blocklist:        this.options.blocklist,
    });

    if (!result.ok) {
      console.warn(`[UCAN] Rejected update from "${fromPeer}": ${result.reason}`);
      return null;
    }

    return update;
  }
}