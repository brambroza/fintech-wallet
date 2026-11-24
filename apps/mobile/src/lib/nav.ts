import { router } from "expo-router";

/**
 * Leave the sign-in stack entirely, so Back can't return to PIN/OTP screens.
 * The replace runs after dismissAll has been applied (calling both in the same tick drops the replace).
 */
export function goHome() {
  if (router.canDismiss()) {
    router.dismissAll();
    setTimeout(() => router.replace("/home"), 0);
  } else router.replace("/home");
}
