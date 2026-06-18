import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { ReviewDetail } from "./api/expertReviews";

const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ revoked: true }));
const approvePrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "APPROVED" }));
const requestMoreInformationMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "NEEDS_INFO" }));
const pausePrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "PAUSED" }));
const referPrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "REFERRED" }));
const rejectPrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "REJECTED" }));
const startReviewMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "IN_REVIEW" }));
const getReviewStatsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    average_review_hours: 1.4,
    r2_pending_count: 12,
    timeout_count: 0
  })
);
const listReviewQueueMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      prescription_id: 81,
      user_id: 2,
      organization_id: 6,
      risk_level: "R3",
      status: "PENDING_REVIEW",
      prescription_type: "referral",
      abnormal_feedback_count: 2,
      version: 1,
      created_at: "2026-06-02T00:00:00Z",
      review_id: 10
    },
    {
      prescription_id: 82,
      user_id: 5,
      organization_id: 7,
      risk_level: "R2",
      status: "IN_REVIEW",
      prescription_type: "training",
      abnormal_feedback_count: 0,
      version: 3,
      created_at: "2026-06-03T00:00:00Z",
      review_id: 12
    }
  ])
);
const getReviewDetailMock = vi.hoisted(() =>
  vi.fn(async (prescriptionId: number): Promise<ReviewDetail> => ({
    prescription: {
      id: prescriptionId,
      risk_level: prescriptionId === 81 ? "R3" : "R2",
      status: prescriptionId === 81 ? "REFERRED" : "PENDING_REVIEW",
      fitt_vp: prescriptionId === 81
        ? null
        : {
            frequency: "每周 3-5 次",
            intensity: "中低强度",
            time: "每次 30-45 分钟",
            type: ["快走", "功率自行车"],
            volume: "每周 120 分钟",
            progression: "每 2-4 周按反馈调整"
          },
      precautions: ["监测血压"],
      contraindications: ["憋气用力", "大重量抗阻"],
      reassessment: "4周复评",
      safety_notice: "专家审核前不得自动发布。",
      evidence_refs: []
    },
    review: { id: 10, status: "PENDING" },
    health_snapshot: {
      profile: { name: "张建国", age: 62, sex: "男" },
      fitness_test: { sbp: prescriptionId === 81 ? 182 : 145, dbp: 88, pain_score: 2 },
      body_composition: { bmi: 26.4, body_fat_pct: 28 },
      risk_screening: { chest_pain: prescriptionId === 81, has_hypertension: true }
    },
    risk_rules: [
      {
        code: prescriptionId === 81 ? "R3_RED_FLAG" : "YELLOW_HYPERTENSION",
        message: prescriptionId === 81 ? "近期不明原因胸闷，禁止训练处方" : "高血压边界风险需专家审核"
      }
    ],
    evidence_refs: [
      {
        chunk_id: 1,
        document_title: "高血压运动干预指南 2020版",
        section: "运动原则",
        quote: "优先推荐中低强度有氧运动，避免憋气动作。"
      }
    ],
    template: { name: "高血压稳定期改善模板" },
    candidate_actions: [{ id: 1, name: "快走", contraindication_tags: ["胸痛"] }]
  }))
);

vi.mock("./api/expertReviews", () => ({
  approvePrescription: approvePrescriptionMock,
  getReviewDetail: getReviewDetailMock,
  getReviewStats: getReviewStatsMock,
  listReviewQueue: listReviewQueueMock,
  pausePrescription: pausePrescriptionMock,
  requestMoreInformation: requestMoreInformationMock,
  referPrescription: referPrescriptionMock,
  rejectPrescription: rejectPrescriptionMock,
  startReview: startReviewMock
}));

vi.mock("./api/auth", async () => {
  const actual = await vi.importActual<typeof import("./api/auth")>("./api/auth");
  return {
    ...actual,
    logout: logoutMock
  };
});

function renderExpertRoute(path: string) {
  localStorage.setItem("access_token", "test-token");
  localStorage.setItem("refresh_token", "refresh-token");
  localStorage.setItem("current_user_role", "EXPERT");
  localStorage.setItem("current_user_id", "17");
  localStorage.setItem("current_user_name", "李主任医生");

  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </MemoryRouter>
  );
}

describe("expert direct portal replacement", () => {
  beforeEach(() => {
    localStorage.clear();
    approvePrescriptionMock.mockClear();
    requestMoreInformationMock.mockClear();
    pausePrescriptionMock.mockClear();
    referPrescriptionMock.mockClear();
    rejectPrescriptionMock.mockClear();
    logoutMock.mockClear();
    startReviewMock.mockClear();
    getReviewDetailMock.mockClear();
    getReviewStatsMock.mockClear();
    listReviewQueueMock.mockClear();
  });

  it("renders the expert-pages triage dashboard instead of the old ProductUI workbench", async () => {
    renderExpertRoute("/expert/dashboard");

    expect(await screen.findByRole("heading", { name: "紧急分诊与队列" })).toBeInTheDocument();
    expect(screen.getByText("专家工作台 (EXPERT)")).toBeInTheDocument();
    expect(screen.getByText("平均审核耗时")).toBeInTheDocument();
    expect(screen.getByText("R2 待审核")).toBeInTheDocument();
    expect(screen.getByText("R3 / 红色异常反馈")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "专家分诊任务列表" })).toBeInTheDocument();
    expect(screen.getByText("处方 #81")).toBeInTheDocument();
    expect(screen.getByText("近期不明原因胸闷")).toBeInTheDocument();
    expect(screen.queryByText("DataWorkbench")).not.toBeInTheDocument();
    expect(screen.queryByText("FITT-VP 结构化编辑器")).not.toBeInTheDocument();
    expect(listReviewQueueMock).toHaveBeenCalledWith({});
  });

  it("opens the single review workspace and publishes R2 prescriptions only after safety confirmation", async () => {
    renderExpertRoute("/expert/reviews/82");

    expect(await screen.findByRole("heading", { name: "单任务审核工作台" })).toBeInTheDocument();
    expect(screen.getByText("患者：张建国 | 男 | 62岁")).toBeInTheDocument();
    expect(screen.getByText("用户安全摘要")).toBeInTheDocument();
    expect(screen.getByText("系统初稿核对与编辑")).toBeInTheDocument();
    expect(screen.getByText("规则与证据核对")).toBeInTheDocument();
    expect(screen.getByText("高血压稳定期改善模板")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("频率 (Frequency)"), { target: { value: "每周 2 次" } });
    fireEvent.change(screen.getByLabelText("单次时间 (Time)"), { target: { value: "每次 20 分钟" } });
    fireEvent.click(screen.getByRole("button", { name: "核对并批准发布" }));
    const dialog = await screen.findByRole("dialog", { name: "安全二次确认" });
    expect(within(dialog).getByRole("button", { name: "确认发布" })).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText("我已亲自核对用户的医疗风险、禁忌动作与处方运动强度"));
    fireEvent.click(within(dialog).getByRole("button", { name: "确认发布" }));

    await waitFor(() =>
      expect(approvePrescriptionMock).toHaveBeenCalledWith(82, expect.objectContaining({
        review_comment: "我已亲自核对用户的医疗风险、禁忌动作与处方运动强度，确认该处方可安全执行。",
        edited_prescription: expect.objectContaining({
          fitt_vp: expect.objectContaining({
            frequency: "每周 2 次",
            time: "每次 20 分钟",
            intensity: "中低强度 (RPE 4-6)"
          })
        })
      }))
    );
  });

  it("blocks R3 training prescription publishing and sends referral actions", async () => {
    renderExpertRoute("/expert/reviews/81");

    expect(await screen.findByRole("heading", { name: "单任务审核工作台" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "R3 高风险转介型" })).toBeInTheDocument();
    expect(await screen.findByText("系统已安全阻断，该用户禁止生成训练处方。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核对并批准发布" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "核对并发送转介通知" }));
    await waitFor(() =>
      expect(referPrescriptionMock).toHaveBeenCalledWith(81, expect.objectContaining({
        review_comment: expect.stringContaining("运动高危红旗症状")
      }))
    );
    expect(approvePrescriptionMock).not.toHaveBeenCalled();
  });

  it("lets experts start a queued review before opening the workspace", async () => {
    renderExpertRoute("/expert/dashboard");

    expect(await screen.findByRole("heading", { name: "紧急分诊与队列" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "领取并审核" }));

    await waitFor(() => expect(startReviewMock).toHaveBeenCalledWith(81));
    expect(await screen.findByRole("heading", { name: "单任务审核工作台" })).toBeInTheDocument();
  });

  it("keeps the triage dashboard stable when the review queue is empty", async () => {
    listReviewQueueMock.mockResolvedValueOnce([]);

    renderExpertRoute("/expert/dashboard");

    expect(await screen.findByRole("heading", { name: "紧急分诊与队列" })).toBeInTheDocument();
    expect(await screen.findByText("当前筛选条件下没有待处理审核任务。")).toBeInTheDocument();
    expect(screen.getByText("处方 #-- · 等待专家分诊")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开单任务审核" })).toBeDisabled();
  });

  it("uses queue filters and prescription search when loading the expert review queue", async () => {
    renderExpertRoute("/expert/dashboard");

    expect(await screen.findByRole("heading", { name: "紧急分诊与队列" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "待领取" }));
    await waitFor(() => expect(listReviewQueueMock).toHaveBeenLastCalledWith({ status: "PENDING_REVIEW" }));

    fireEvent.click(screen.getByRole("button", { name: "我的审核中" }));
    await waitFor(() => expect(listReviewQueueMock).toHaveBeenLastCalledWith({ status: "IN_REVIEW" }));

    fireEvent.click(screen.getByRole("button", { name: "全部待办" }));
    await waitFor(() => expect(listReviewQueueMock).toHaveBeenLastCalledWith({}));
    fireEvent.change(screen.getByPlaceholderText("搜索患者或处方编号"), { target: { value: "81" } });
    await waitFor(() => expect(listReviewQueueMock).toHaveBeenLastCalledWith({ search: "81" }));
    await waitFor(() => expect(screen.getByText("处方 #81")).toBeInTheDocument());
    expect(screen.queryByText("处方 #82")).not.toBeInTheDocument();
  });

  it("requests missing clinical data and rejects drafts from the review workspace", async () => {
    renderExpertRoute("/expert/reviews/82");

    expect(await screen.findByRole("heading", { name: "单任务审核工作台" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "要求补充体测数据" }));
    await waitFor(() =>
      expect(requestMoreInformationMock).toHaveBeenCalledWith(82, expect.objectContaining({
        review_comment: expect.stringContaining("体测数据")
      }))
    );
    expect(await screen.findByText("已发送补充资料要求")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "驳回初稿重生成" }));
    await waitFor(() =>
      expect(rejectPrescriptionMock).toHaveBeenCalledWith(82, expect.objectContaining({
        review_comment: expect.stringContaining("重新生成")
      }))
    );
  });

  it("requests hospital diagnosis information and can pause high-risk prescriptions", async () => {
    renderExpertRoute("/expert/reviews/81");

    expect(await screen.findByRole("heading", { name: "单任务审核工作台" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "要求补充院内诊断资料" }));
    await waitFor(() =>
      expect(requestMoreInformationMock).toHaveBeenCalledWith(81, expect.objectContaining({
        review_comment: expect.stringContaining("院内诊断资料")
      }))
    );

    fireEvent.click(screen.getByRole("button", { name: "暂停处方执行" }));
    await waitFor(() =>
      expect(pausePrescriptionMock).toHaveBeenCalledWith(81, expect.objectContaining({
        review_comment: expect.stringContaining("暂停")
      }))
    );
  });

  it("clears the expert session and returns to login when logging out", async () => {
    renderExpertRoute("/expert/dashboard");

    expect(await screen.findByRole("heading", { name: "紧急分诊与队列" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledWith("refresh-token"));
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(localStorage.getItem("current_user_role")).toBeNull();
    expect(localStorage.getItem("current_user_id")).toBeNull();
  });
});
