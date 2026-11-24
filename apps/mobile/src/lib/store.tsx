import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Me, type Quote, type Target, type Txn } from "./api";

/** Multi-screen drafts (register + send) and the cached profile. */
type RegisterDraft = { phone: string; displayName: string; otpId?: string; code?: string };
type SendDraft = { target?: Target; recipientName?: string; amount?: number; note?: string; quote?: Quote; idempotencyKey?: string; result?: Txn; errorText?: string };
type LoginDraft = { phone: string; otpId: string; maskedPhone: string; devCode?: string };

type Store = {
  me: Me | null;
  loadMe: () => Promise<Me | null>;
  setMe: (m: Me | null) => void;
  register: RegisterDraft;
  setRegister: (p: Partial<RegisterDraft>) => void;
  login: LoginDraft | null;
  setLogin: (l: LoginDraft | null) => void;
  send: SendDraft;
  setSend: (p: Partial<SendDraft> | null) => void;
  kycImages: { idCard?: string };
  devOtp: { current?: string };
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [register, setReg] = useState<RegisterDraft>({ phone: "", displayName: "" });
  const [login, setLogin] = useState<LoginDraft | null>(null);
  const [send, setSendState] = useState<SendDraft>({});
  // Images are large; keep them out of React state.
  const kycImages = useRef<{ idCard?: string }>({}).current;
  const devOtp = useRef<{ current?: string }>({}).current;

  const loadMe = useCallback(async () => {
    try {
      const m = await api.me();
      setMe(m);
      return m;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<Store>(
    () => ({
      me,
      loadMe,
      setMe,
      register,
      setRegister: (p) => setReg((r) => ({ ...r, ...p })),
      login,
      setLogin,
      send,
      setSend: (p) => setSendState((s) => (p === null ? {} : { ...s, ...p })),
      kycImages,
      devOtp,
    }),
    [me, loadMe, register, login, send, kycImages, devOtp],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
