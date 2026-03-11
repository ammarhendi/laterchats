/**
 * End-to-End Encryption (E2EE) Library
 *
 * Uses ECDH P-256 for key exchange and AES-GCM 256-bit for message encryption.
 * The server never sees plaintext — only encrypted ciphertext is transmitted.
 *
 * Flow:
 *  1. On first login, generate an ECDH key pair and store private key in SecureStore.
 *  2. Publish the public key (JWK format) to the server via socket.
 *  3. When sending a PM, derive a shared secret with recipient's public key, then encrypt.
 *  4. When receiving a PM, derive the same shared secret and decrypt.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PRIVATE_KEY_STORE = "e2ee_private_key_jwk";
const PUBLIC_KEY_STORE = "e2ee_public_key_jwk";

// ── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Key Generation ────────────────────────────────────────────────────────────

/**
 * Generate a new ECDH P-256 key pair.
 * Returns { publicKeyJwk, privateKeyJwk } as JSON strings.
 */
export async function generateKeyPair(): Promise<{ publicKeyJwk: string; privateKeyJwk: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable
    ["deriveKey", "deriveBits"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKeyJwk: JSON.stringify(publicKeyJwk),
    privateKeyJwk: JSON.stringify(privateKeyJwk),
  };
}

// ── Key Storage ───────────────────────────────────────────────────────────────

/**
 * Load or generate the user's ECDH key pair from SecureStore.
 * Returns the public key JWK string (to share with server).
 */
export async function getOrCreateKeyPair(): Promise<string> {
  try {
    // On web, SecureStore is not available — use sessionStorage as fallback
    if (Platform.OS === "web") {
      let pubKey = sessionStorage.getItem(PUBLIC_KEY_STORE);
      let privKey = sessionStorage.getItem(PRIVATE_KEY_STORE);
      if (!pubKey || !privKey) {
        const kp = await generateKeyPair();
        sessionStorage.setItem(PUBLIC_KEY_STORE, kp.publicKeyJwk);
        sessionStorage.setItem(PRIVATE_KEY_STORE, kp.privateKeyJwk);
        pubKey = kp.publicKeyJwk;
      }
      return pubKey;
    }

    let privKeyJwk = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
    let pubKeyJwk = await SecureStore.getItemAsync(PUBLIC_KEY_STORE);

    if (!privKeyJwk || !pubKeyJwk) {
      const kp = await generateKeyPair();
      await SecureStore.setItemAsync(PRIVATE_KEY_STORE, kp.privateKeyJwk);
      await SecureStore.setItemAsync(PUBLIC_KEY_STORE, kp.publicKeyJwk);
      privKeyJwk = kp.privateKeyJwk;
      pubKeyJwk = kp.publicKeyJwk;
    }

    return pubKeyJwk;
  } catch (err) {
    console.warn("[E2EE] Key storage error:", err);
    // Fallback: generate ephemeral key pair (not persisted)
    const kp = await generateKeyPair();
    return kp.publicKeyJwk;
  }
}

async function getPrivateKey(): Promise<CryptoKey | null> {
  try {
    let privKeyJwkStr: string | null = null;

    if (Platform.OS === "web") {
      privKeyJwkStr = sessionStorage.getItem(PRIVATE_KEY_STORE);
    } else {
      privKeyJwkStr = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
    }

    if (!privKeyJwkStr) return null;

    const privKeyJwk = JSON.parse(privKeyJwkStr);
    return await crypto.subtle.importKey(
      "jwk",
      privKeyJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveKey", "deriveBits"]
    );
  } catch (err) {
    console.warn("[E2EE] Failed to load private key:", err);
    return null;
  }
}

// ── Shared Secret Derivation ──────────────────────────────────────────────────

async function deriveSharedKey(recipientPublicKeyJwk: string): Promise<CryptoKey | null> {
  try {
    const myPrivateKey = await getPrivateKey();
    if (!myPrivateKey) return null;

    const recipientPublicKey = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(recipientPublicKeyJwk),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    return await crypto.subtle.deriveKey(
      { name: "ECDH", public: recipientPublicKey },
      myPrivateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    console.warn("[E2EE] Failed to derive shared key:", err);
    return null;
  }
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext message for a recipient.
 * Returns a base64-encoded string: iv (12 bytes) + ciphertext, or null on failure.
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyJwk: string
): Promise<string | null> {
  try {
    const sharedKey = await deriveSharedKey(recipientPublicKeyJwk);
    if (!sharedKey) return null;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedKey,
      encodedText
    );

    // Combine iv + ciphertext into a single buffer
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    return arrayBufferToBase64(combined.buffer);
  } catch (err) {
    console.warn("[E2EE] Encryption failed:", err);
    return null;
  }
}

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * Decrypt a base64-encoded encrypted message from a sender.
 * Returns the plaintext string, or null on failure.
 */
export async function decryptMessage(
  encryptedBase64: string,
  senderPublicKeyJwk: string
): Promise<string | null> {
  try {
    const sharedKey = await deriveSharedKey(senderPublicKeyJwk);
    if (!sharedKey) return null;

    const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      sharedKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("[E2EE] Decryption failed:", err);
    return null;
  }
}

// ── Public Key Registry ───────────────────────────────────────────────────────

// In-memory cache of other users' public keys (received via socket)
const publicKeyRegistry: Map<string, string> = new Map();

export function registerPublicKey(nickname: string, publicKeyJwk: string): void {
  publicKeyRegistry.set(nickname.toLowerCase(), publicKeyJwk);
}

export function getPublicKey(nickname: string): string | undefined {
  return publicKeyRegistry.get(nickname.toLowerCase());
}

export function clearPublicKeyRegistry(): void {
  publicKeyRegistry.clear();
}
