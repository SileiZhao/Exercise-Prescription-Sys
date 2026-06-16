import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      name: "DBSCAN 分型 v1",
      algorithm: "DBSCAN",
      n_clusters: 2,
      status: "ACTIVE",
      model_origin: "bootstrap_rule_calibrated",
      model_params: {
        predict_strategy: "density_approximation",
        predict_strategy_label: "密度近似分类，不确定时需专家解释",
        noise_label: "未归类/需专家解释"
      },
      metrics: { silhouette_score: 0.31, davies_bouldin_score: 1.8, cluster_stability: 0.82, noise_rate: 0.12, evaluation_passed: 1 },
      feature_names: ["bmi", "sbp"],
      cluster_profiles: [
        {
          cluster_id: 0,
          size: 12,
          suggested_labels: ["代谢风险", "体重管理"],
          explanation: "该类样本主要表现为代谢风险。",
          core_risks: ["中心型肥胖或糖脂代谢风险"],
          exercise_goals: ["改善体重、腰围与糖脂代谢"],
          fitt_range: { frequency: "每周3-5次", intensity: "低至中等强度" },
          contraindications: ["避免突然大强度冲刺"],
          review_recommendation: "R2、R3 或出现异常反馈时需专家复核。"
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
      model_origin: "bootstrap_rule_calibrated",
      model_params: { predict_strategy: "nearest_center", predict_strategy_label: "最近中心分类" },
      metrics: { silhouette_score: 0.42, davies_bouldin_score: 1.4, cluster_stability: 0.86, evaluation_passed: 1 },
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
    localStorage.setItem("current_user_role", "ADMIN");

    render(
      <MemoryRouter
        initialEntries={["/admin/clusters"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "聚类模型生命周期" })).toBeInTheDocument();
    expect(screen.getByText("衡策运动处方平台")).toBeInTheDocument();
    expect(await screen.findByText("DBSCAN 分型 v1")).toBeInTheDocument();
    const modelVersionSection = screen.getByText("模型版本").closest("section");
    expect(modelVersionSection).not.toBeNull();
    expect(within(modelVersionSection as HTMLElement).queryByRole("columnheader", { name: "算法" })).not.toBeInTheDocument();
    expect(within(modelVersionSection as HTMLElement).queryByRole("columnheader", { name: "来源" })).not.toBeInTheDocument();
    expect(within(modelVersionSection as HTMLElement).queryByRole("columnheader", { name: "轮廓系数" })).not.toBeInTheDocument();
    expect(within(modelVersionSection as HTMLElement).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "模型名称",
      "评估",
      "状态",
      "聚类数",
      "关键指标",
      "详情"
    ]);
    expect(screen.getByText(/冷启动模型不能作为正式科研聚类结论/)).toBeInTheDocument();
    expect(screen.getByTestId("ClusterScatterChart-echart")).toBeInTheDocument();
    expect(screen.getAllByText("通过").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "查看详情 DBSCAN 分型 v1" }));
    expect(screen.getAllByText("冷启动规则校准模型").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0.12/).length).toBeGreaterThan(0);
    expect(screen.getByText("中心型肥胖或糖脂代谢风险")).toBeInTheDocument();
    expect(screen.getByText(/0.42/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看详情 KMeans 分型 v2" }));
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
    localStorage.setItem("current_user_role", "ADMIN");
    trainClusterModelMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/clusters"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "聚类模型生命周期" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "训练模型" })[0]);
    const trainDrawer = await screen.findByRole("dialog", { name: "训练聚类分型模型" });
    fireEvent.change(within(trainDrawer).getByLabelText("模型名称"), { target: { value: "GMM 新模型" } });
    fireEvent.mouseDown(within(trainDrawer).getByRole("combobox", { name: "算法" }));
    fireEvent.click(screen.getByText("GaussianMixture"));
    fireEvent.change(within(trainDrawer).getByLabelText("聚类数"), { target: { value: 4 } });
    fireEvent.click(within(trainDrawer).getByRole("button", { name: "训练模型" }));

    await waitFor(() =>
      expect(trainClusterModelMock).toHaveBeenCalledWith({
        name: "GMM 新模型",
        n_clusters: 4,
        algorithm: "GaussianMixture"
      })
    );
    expect(await screen.findByText("聚类模型训练完成，可在列表中启用。")).toBeInTheDocument();
  });
});
