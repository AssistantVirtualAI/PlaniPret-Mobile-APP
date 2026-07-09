// Backwards-compatible re-export. New code should use ./permissions/orchestrator.
import { runPermissionFlow } from "./permissions/orchestrator";
import { isNative } from "./permissions/platform";

export async function requestPermissionsAfterLogin(extension?: string): Promise<void> {
  try {
    if (!(await isNative())) return;
    await runPermissionFlow(extension);
  } catch (e) {
    console.warn("[permissions] requestPermissionsAfterLogin failed", e);
  }
}
