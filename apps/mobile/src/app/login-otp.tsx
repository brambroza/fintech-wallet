import { router } from "expo-router";
import { goHome } from "@/lib/nav";
import { OtpScreen } from "@/components/OtpScreen";
import { errorText } from "@/lib/api";
import { api } from "@/lib/api";
import { session } from "@/lib/session";
import { useStore } from "@/lib/store";

export default function LoginOtp() {
  const { login, setLogin, loadMe } = useStore();
  if (!login) {
    router.replace("/login");
    return null;
  }
  return (
    <OtpScreen
      title="ยืนยันเครื่องใหม่"
      maskedPhone={login.maskedPhone}
      note="ขอ OTP เฉพาะเมื่อเข้าจากเครื่องใหม่เท่านั้น"
      devCode={login.devCode}
      onSubmit={async (code) => {
        try {
          await session.saveTokens(await api.loginVerify(login.otpId, code));
          const me = await loadMe();
          if (me) await session.saveProfile(me.phone ?? login.phone, me.displayName);
          setLogin(null);
          goHome();
          return null;
        } catch (e) {
          return errorText(e);
        }
      }}
      onResend={async () => {
        // A new login OTP is issued by logging in again; send the user back to re-enter the PIN.
        router.replace("/login");
        return null;
      }}
    />
  );
}
