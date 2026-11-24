import packageJson from '../package.json';

// ----------------------------------------------------------------------

export type ConfigValue = {
  site: {
    name: string;
    basePath: string;
    serverUrl: string;
    version: string;
  };
  /** LINE LIFF app id for the employee page (/liff). Empty = LIFF disabled, normal login. */
  liffId: string;
  /** Sandbox API: shows OTP codes + allows `sandbox:` LINE tokens. */
  sandbox: boolean;
};

// ----------------------------------------------------------------------

/**
 * จุดเดียวที่อ่าน `import.meta.env` — component อื่นให้อ่านผ่าน `CONFIG` เท่านั้น
 * `site.basePath` ถูกใช้โดย theme (mixins), settings drawer, logo, image, empty-content
 * สำหรับประกอบ URL ของไฟล์ใน `public/`
 */
export const CONFIG: ConfigValue = {
  site: {
    name: 'Canteen Wallet',
    basePath: import.meta.env.VITE_BASE_PATH ?? '',
    serverUrl: import.meta.env.VITE_SERVER_URL ?? '',
    version: packageJson.version,
  },
  liffId: import.meta.env.VITE_LIFF_ID ?? '',
  sandbox: import.meta.env.VITE_SANDBOX === 'true',
};
