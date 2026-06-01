import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./api/expertReviews", () => ({
  listReviewQueue: vi.fn().mockResolvedValue([])
}));

describe("expert review workspace", () => {
  it("renders expert review queue and three-column cues", () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("审核队列")).toBeInTheDocument();
    expect(screen.getByText("用户画像")).toBeInTheDocument();
    expect(screen.getByText("处方编辑")).toBeInTheDocument();
    expect(screen.getByText("规则证据")).toBeInTheDocument();
  });
});
