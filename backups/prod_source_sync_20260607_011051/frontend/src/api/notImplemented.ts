import { apiClient } from "./client";

export const notImplementedMessage = "暂未实现，当前版本暂不支持该功能。";

export async function callNotImplemented(path: string) {
  try {
    await apiClient.post(path);
  } catch {
    return notImplementedMessage;
  }
  return notImplementedMessage;
}
