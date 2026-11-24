import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Me, type PayTarget, type Txn } from "./api";

/** Multi-screen drafts (activation, login OTP, payment) and the cached profile. */
type ActivateDraft = { phone: string; otpId?: string; code?: string };
type LoginDraft = { phone: string; otpId: string; maskedPhone: string; devCode?: string };
type PayDraft = { target?: PayTarget; amount?: number; idempotencyKey?: string; result?: Txn; errorText?: string };

type Store = {
  me: Me | null;
  loadMe: () => Promise<Me | null>;
  setMe: (m: Me | null) => void;
  activate: ActivateDraft;
  setActivate: (p: Partial<ActivateDraft>) => void;
  login: LoginDraft | null;
  setLogin: (l: LoginDraft | null) => void;
  pay: PayDraft;
  setPay: (p: Partial<PayDraft> | null) => void;
  devOtp: { current?: string };
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [activate, setAct] = useState<ActivateDraft>({ phone: "" });
  const [login, setLogin] = useState<LoginDraft | null>(null);
  const [pay, setPayState] = useState<PayDraft>({});
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
      activate,
      setActivate: (p) => setAct((a) => ({ ...a, ...p })),
      login,
      setLogin,
      pay,
      setPay: (p) => setPayState((s) => (p === null ? {} : { ...s, ...p })),
      devOtp,
    }),
    [me, loadMe, activate, login, pay, devOtp],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
