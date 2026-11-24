import { router } from "expo-router";
import { OtpScreen } from "@/components/OtpScreen";
import { api, errorText } from "@/lib/api";
import { maskPhone } from "@/lib/format";
import { useStore } from "@/lib/store";

/** The code is checked by the server together with the PIN (next screen). */
export default function ActivateOtp() {
  const { activate, setActivate, devOtp } = useStore();
  if (!activate.otpId) {
    router.replace("/activate");
    return null;
  }
  return (
    <OtpScreen
      title="ยืนยันเบอร์โทร"
      maskedPhone={maskPhone(activate.phone)}
      devCode={devOtp.current}
      onSubmit={async (code) => {
        setActivate({ code });
        router.push("/activate/pin");
        return null;
      }}
      onResend={async () => {
        try {
          const r = await api.activateOtp(activate.phone);
          devOtp.current = r.code;
          setActivate({ otpId: r.otpId, code: undefined });
          return null;
        } catch (e) {
          return errorText(e);
        }
      }}
    />
  );
}
