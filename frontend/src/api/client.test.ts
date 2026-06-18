import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it } from "vitest";

import { apiClient, resolveApiBaseUrl } from "./client";

function response(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config
  };
}

describe("resolveApiBaseUrl", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the configured API URL when one is provided", () => {
    expect(
      resolveApiBaseUrl("http://api.example.test/api/v1", {
        protocol: "http:",
        hostname: "192.168.2.15"
      })
    ).toBe("http://api.example.test/api/v1");
  });

  it("uses the same-origin API proxy when no API URL is configured", () => {
    expect(
      resolveApiBaseUrl(undefined, {
        protocol: "http:",
        hostname: "192.168.2.15"
      })
    ).toBe("/api/v1");
  });

  it("refreshes an expired access token and retries the original request once", async () => {
    localStorage.setItem("access_token", "expired-access");
    localStorage.setItem("refresh_token", "valid-refresh");
    const seenAuthorizations: Array<string | undefined> = [];
    let protectedCalls = 0;

    apiClient.defaults.adapter = async (config): Promise<AxiosResponse> => {
      const typedConfig = config as InternalAxiosRequestConfig;
      if (config.url === "/protected-resource") {
        protectedCalls += 1;
        seenAuthorizations.push(String(config.headers?.Authorization ?? ""));
        if (protectedCalls === 1) {
          return Promise.reject({
            config,
            response: { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config }
          });
        }
        return response(typedConfig, { ok: true });
      }

      if (config.url === "/auth/refresh") {
        expect(config.data).toBe(JSON.stringify({ refresh_token: "valid-refresh" }));
        return response(typedConfig, {
          access_token: "fresh-access",
          refresh_token: "fresh-refresh",
          token_type: "bearer",
          must_change_password: false
        });
      }

      throw new Error(`Unexpected request ${config.url}`);
    };

    const result = await apiClient.get("/protected-resource");

    expect(result.data).toEqual({ ok: true });
    expect(protectedCalls).toBe(2);
    expect(seenAuthorizations).toEqual(["Bearer expired-access", "Bearer fresh-access"]);
    expect(localStorage.getItem("access_token")).toBe("fresh-access");
    expect(localStorage.getItem("refresh_token")).toBe("fresh-refresh");
  });

  it("clears the session when token refresh fails", async () => {
    localStorage.setItem("access_token", "expired-access");
    localStorage.setItem("refresh_token", "bad-refresh");
    localStorage.setItem("current_user_role", "USER");
    localStorage.setItem("current_user_id", "9");

    apiClient.defaults.adapter = async (config): Promise<AxiosResponse> => {
      if (config.url === "/auth/refresh") {
        return Promise.reject({
          config,
          response: { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config }
        });
      }
      return Promise.reject({
        config,
        response: { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config }
      });
    };

    await expect(apiClient.get("/protected-resource")).rejects.toBeTruthy();

    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(localStorage.getItem("current_user_role")).toBeNull();
    expect(localStorage.getItem("current_user_id")).toBeNull();
  });
});
