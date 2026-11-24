import { router } from "expo-router";
import { OtpScreen } from "@/components/OtpScreen";
import { api, errorText } from "@/lib/api";
import { maskPhone } from "@/lib/format";
import { useStore } from "@/lib/store";

/** OTP is verified server-side together with the PIN in /auth/register (next screen). */
export default function RegisterOtp() {
  const { register, setRegister, devOtp } = useStore();
  if (!register.otpId) {
    router.replace("/register");
    return null;
  }
  return (
    <OtpScreen
      title="ยืนยันเบอร์โทร"
      maskedPhone={maskPhone(register.phone)}
      devCode={devOtp.current}
      onSubmit={async (code) => {
        setRegister({ code });
        router.push("/register/pin");
        return null;
      }}
      onResend={async () => {
        try {
          const r = await api.registerOtp(register.phone);
          devOtp.current = r.code;
          setRegister({ otpId: r.otpId, code: undefined });
          return null;
        } catch (e) {
          return errorText(e);
        }
      }}
    />
  );
}
