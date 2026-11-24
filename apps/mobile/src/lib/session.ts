import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

/**
 * Secrets live in the OS keychain/keystore, never AsyncStorage.
 * The access token stays in memory only.
 */
const K = {
  device: "wallet.device_id",
  refresh: "wallet.refresh_token",
  phone: "wallet.phone",
  name: "wallet.display_name",
  biometric: "wallet.biometric_enabled",
} as const;

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

let accessToken: string | null = null;
let deviceIdCache: string | null = null;

export const session = {
  getAccess: () => accessToken,
  setAccess: (t: string | null) => {
    accessToken = t;
  },

  async deviceId(): Promise<string> {
    if (deviceIdCache) return deviceIdCache;
    let id = await SecureStore.getItemAsync(K.device, opts);
    if (!id) {
      id = Crypto.randomUUID();
      await SecureStore.setItemAsync(K.device, id, opts);
    }
    deviceIdCache = id;
    return id;
  },

  getRefresh: () => SecureStore.getItemAsync(K.refresh, opts),
  setRefresh: (t: string) => SecureStore.setItemAsync(K.refresh, t, opts),

  async saveTokens(t: { accessToken: string; refreshToken: string }) {
    accessToken = t.accessToken;
    await SecureStore.setItemAsync(K.refresh, t.refreshToken, opts);
  },

  async saveProfile(phone: string, name: string) {
    await SecureStore.setItemAsync(K.phone, phone, opts);
    await SecureStore.setItemAsync(K.name, name, opts);
  },
  async profile() {
    return {
      phone: await SecureStore.getItemAsync(K.phone, opts),
      name: await SecureStore.getItemAsync(K.name, opts),
    };
  },

  biometricEnabled: async () => (await SecureStore.getItemAsync(K.biometric, opts)) === "1",
  setBiometric: (on: boolean) => SecureStore.setItemAsync(K.biometric, on ? "1" : "0", opts),

  /** Sign out on this device. Keeps device id (device binding) and phone (pre-fill login). */
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(K.refresh, opts);
  },
};
