// Server-only WireGuard keypair generation for Magic Hub provisioning.
import { x25519 } from "@noble/curves/ed25519.js";

export type WireguardKeys = {
  privateKey: string; // base64, WireGuard format
  publicKey: string; // base64
};

export function generateWireguardKeys(): WireguardKeys {
  const secret = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(secret);
  return {
    privateKey: Buffer.from(secret).toString("base64"),
    publicKey: Buffer.from(pub).toString("base64"),
  };
}
