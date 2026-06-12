import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "./client";

describe("resolveApiBaseUrl", () => {
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
});
