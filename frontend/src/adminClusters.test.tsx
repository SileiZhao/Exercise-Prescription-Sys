import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

const trainClusterModelMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 2,
    name: "KMeans 分型 v2",
    algorithm: "KMeans",
    n_clusters: 3,
    status: "TRAINED",
    metrics: { silhouette_score: 0.42 },
    feature_names: ["bmi", "sbp"],
    cluster_profiles: [],
    created_at: "2026-05-30T10:00:00"
  })
);
const updateClusterModelStatusMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 2, status: "ACTIVE" }));
const listClusterModelsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "KMeans 分型 v1",
      algorithm: "KMeans",
      n_clusters: 2,
      status: "ACTIVE",
      metrics: { silhouette_score: 0.31 },
      feature_names: ["bmi", "sbp"],
      cluster_profiles: [
        {
          cluster_id: 0,
          size: 12,
          suggested_labels: ["肥胖代谢风险型"],
          explanation: "该类样本主要表现为肥胖代谢风险型。"
        }
      ],
      created_at: "2026-05-30T10:00:00"
    },
    {
      id: 2,
      name: "KMeans 分型 v2",
      algorithm: "KMeans",
      n_clusters: 3,
      status: "TRAINED",
      metrics: { silhouette_score: 0.42 },
      feature_names: ["bmi", "sbp"],
      cluster_profiles: [],
      created_at: "2026-05-30T11:00:00"
    }
  ])
);

vi.mock("./api/clusters", () => ({
  listClusterModels: listClusterModelsMock,
  trainClusterModel: trainClusterModelMock,
  updateClusterModelStatus: updateClusterModelStatusMock
}));

describe("admin cluster model page", () => {
  it("renders cluster models and activates a trained model", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/admin/clusters"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("聚类模型管理")).toBeInTheDocument();
    expect(await screen.findByText("KMeans 分型 v1")).toBeInTheDocument();
    expect(screen.getByText("0.42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "启用模型 KMeans 分型 v2" }));

    await waitFor(() =>
      expect(updateClusterModelStatusMock).toHaveBeenCalledWith(2, {
        status: "ACTIVE",
        reason: "管理端启用聚类模型"
      })
    );
  });

  it("trains a cluster model from the management form", async () => {
    localStorage.setItem("access_token", "test-token");
    trainClusterModelMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/clusters"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("模型名称"), { target: { value: "KMeans 新模型" } });
    fireEvent.change(screen.getByLabelText("聚类数"), { target: { value: 4 } });
    fireEvent.click(screen.getByRole("button", { name: "训练模型" }));

    await waitFor(() =>
      expect(trainClusterModelMock).toHaveBeenCalledWith({
        name: "KMeans 新模型",
        n_clusters: 4
      })
    );
    expect(await screen.findByText("聚类模型训练完成，可在列表中启用。")).toBeInTheDocument();
  });
});
