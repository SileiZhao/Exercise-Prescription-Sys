import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("cluster pages", () => {
  it("renders user phenotype page", () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/user/phenotype"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("人群分型")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成分型" })).toBeInTheDocument();
    expect(screen.getByText("分型结果只用于模板匹配，不覆盖风险规则。")).toBeInTheDocument();
  });
});
