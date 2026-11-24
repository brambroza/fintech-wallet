import * as ImagePicker from "expo-image-picker";

/** Take a photo and return base64 JPEG, null if cancelled, or "denied". */
export async function capture(front: boolean): Promise<string | null | "denied"> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return "denied";
  const r = await ImagePicker.launchCameraAsync({
    base64: true,
    mediaTypes: ["images"],
    quality: 0.6,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (r.canceled || !r.assets[0]?.base64) return null;
  return r.assets[0].base64;
}
