/**
 * On a native iPhone, CallKit is the only owner of the answer/reject controls
 * while PJSIP reports an incoming call. Rendering a second React sheet would
 * create a competing answer transaction.
 */
export function nativeCallKitOwnsIncomingUi(
  isNative: boolean,
  platform: string,
  callState: string | null | undefined,
): boolean {
  return isNative && platform === "ios" && callState === "ringing-in";
}
