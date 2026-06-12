import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { ReviewDetail } from "./api/expertReviews";

const approvePrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "APPROVED" }));
const requestMoreInformationMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "NEEDS_INFO" }));
const pausePrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "PAUSED" }));
const referPrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "REFERRED" }));
const rejectPrescriptionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "REJECTED" }));
const startReviewMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "IN_REVIEW" }));
const getReviewStatsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    average_review_hours: 3.5,
    r2_pending_count: 4,
    timeout_count: 1
  })
);
const listReviewQueueMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      prescription_id: 1,
      user_id: 2,
      organization_id: 6,
      risk_level: "R2",
      status: "IN_REVIEW",
      prescription_type: "training",
      abnormal_feedback_count: 2,
      version: 1,
      created_at: "2026-06-02T00:00:00Z",
      review_id: 10
    },
    {
      prescription_id: 2,
      user_id: 5,
      organization_id: 7,
      risk_level: "R2",
      status: "NEEDS_INFO",
      prescription_type: "training",
      abnormal_feedback_count: 0,
      version: 3,
      created_at: "2026-06-03T00:00:00Z",
      review_id: 12
    }
  ])
);
const manyQueueItems = Array.from({ length: 18 }, (_, index) => ({
  prescription_id: index + 20,
  user_id: index + 200,
  organization_id: 6,
  risk_level: index < 4 ? "R3" : "R2",
  status: index < 4 ? "REFERRED" : index < 12 ? "PENDING_REVIEW" : "IN_REVIEW",
  prescription_type: index < 4 ? "referral" : "training",
  abnormal_feedback_count: index % 3 === 0 ? 1 : 0,
  version: 1,
  created_at: `2026-06-${String((index % 9) + 1).padStart(2, "0")}T00:00:00Z`,
  review_id: index + 100
}));
const getReviewDetailMock = vi.hoisted(() =>
  vi.fn(async (prescriptionId: number): Promise<ReviewDetail> => {
    if (prescriptionId === 2) {
      return {
        prescription: {
          id: 2,
          risk_level: "R2",
          status: "NEEDS_INFO",
          fitt_vp: {
            frequency: "每周4次",
            intensity: "中等强度",
            time: "每次35分钟",
            type: ["慢跑"],
            volume: "每周140分钟",
            progression: "每周增加10分钟"
          },
          precautions: ["缺少近期血糖"],
          contraindications: ["胸痛时运动"],
          reassessment: "3周复评",
          safety_notice: "待补充资料后复核。",
          evidence_refs: []
        },
        review: {
          id: 12,
          status: "NEEDS_INFO",
          review_comment: "上一轮要求补充近期血糖。",
          edited_prescription: {
            fitt_vp: {
              intensity: "中等强度",
              time: "每次35分钟"
            }
          }
        },
        health_snapshot: {
          profile: { name: "详情用户", age: 64 },
          fitness_test: { sbp: 150, dbp: 95, pain_score: 2, six_mwt: 420 },
          body_composition: { body_fat_pct: 32, skeletal_muscle_kg: 21 },
          biochemical_index: { fbg: 7.1, ldl_c: 3.8 },
          risk_screening: { has_diabetes: true, chest_pain: false },
          exercise_feedback: { rpe: 16, completion_rate: 58, discomfort: ["头晕"] }
        },
        risk_rules: [{ code: "YELLOW_DIABETES", message: "血糖异常需专家复核" }],
        evidence_refs: [
          { chunk_id: 3, document_title: "糖尿病运动指南", section: "强度控制", quote: "从低强度开始并监测血糖" }
        ],
        template: {
          name: "代谢风险模板",
          fitt_vp: {
            frequency: "每周3次",
            intensity: "低强度",
            time: "每次20分钟",
            type: ["快走"],
            volume: "每周60分钟",
            progression: "2周后复评"
          },
          precautions: ["监测血糖"],
          contraindications: ["低血糖时运动"]
        },
        candidate_actions: [{ id: 2, name: "慢跑", contraindication_tags: ["头晕", "胸痛"] }],
        versions: [
          { version: 1, status: "PENDING_REVIEW", change_reason: "AI_DRAFT", updated_at: "2026-06-01T00:00:00Z" },
          { version: 2, status: "NEEDS_INFO", change_reason: "EXPERT_REQUEST_INFO", updated_at: "2026-06-02T00:00:00Z" }
        ],
        trends: {
          blood_pressure: ["150/95", "146/91"],
          feedback_completion: [58, 72]
        }
      };
    }
    return {
      prescription: {
        id: 1,
        risk_level: "R2",
        status: "PENDING_REVIEW",
        fitt_vp: {
          frequency: "每周3次",
          intensity: "低强度起步",
          time: "每次20分钟",
          type: ["快走", "八段锦"],
          volume: "每周60分钟",
          progression: "每2-4周按反馈调整"
        },
        precautions: ["监测血压"],
        contraindications: ["憋气用力"],
        reassessment: "4周复评",
        safety_notice: "专家审核前不得自动发布。",
        evidence_refs: []
      },
      review: { id: 10, status: "PENDING" },
      health_snapshot: {
        profile: { name: "审核用户" },
        fitness_test: { sbp: 145, dbp: 92, pain_score: 1 }
      },
      risk_rules: [{ code: "YELLOW_HYPERTENSION", message: "高血压需专家审核" }],
      evidence_refs: [{ chunk_id: 1, document_title: "高血压指南", section: "运动原则" }],
      template: { name: "R2审核模板" },
      candidate_actions: [{ id: 1, name: "快走", contraindication_tags: ["胸痛"] }]
    };
  })
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

describe("expert review workspace", () => {
  beforeEach(() => {
    approvePrescriptionMock.mockClear();
    requestMoreInformationMock.mockClear();
    pausePrescriptionMock.mockClear();
    referPrescriptionMock.mockClear();
    rejectPrescriptionMock.mockClear();
    startReviewMock.mockClear();
    getReviewDetailMock.mockClear();
    getReviewStatsMock.mockClear();
    listReviewQueueMock.mockClear();
  });

  it("renders a dedicated expert queue page without prescription editing clutter", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("审核队列")).toBeInTheDocument();
    expect(screen.getByText("队列只做分诊和领取")).toBeInTheDocument();
    expect(screen.queryByText("FITT-VP 结构化编辑器")).not.toBeInTheDocument();
    expect(screen.queryByText("规则证据")).not.toBeInTheDocument();
    expect(await screen.findByText("处方 #1")).toBeInTheDocument();
    expect(await screen.findByText("待领取")).toBeInTheDocument();
    expect(screen.getByText("超时 1 项")).toBeInTheDocument();
    expect(screen.getByText("异常反馈 2")).toBeInTheDocument();
    expect(screen.getByText("处理原则")).toBeInTheDocument();
    expect(screen.getByTestId("ExpertQueueChart-echart")).toBeInTheDocument();
    expect(listReviewQueueMock).toHaveBeenCalledWith({});
  });

  it("renders the expert queue as a paginated data workbench with a selected preview", async () => {
    listReviewQueueMock.mockResolvedValueOnce(manyQueueItems);
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText("数据工作台")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "审核队列表格" })).toBeInTheDocument();
    expect(screen.getByText("选中任务预览")).toBeInTheDocument();
    const queueTable = screen.getByRole("table", { name: "审核队列表格" });
    expect(within(queueTable).getAllByRole("button", { name: /领取|打开/ })).toHaveLength(10);
    expect(screen.getByText("共 18 项")).toBeInTheDocument();
    expect(document.querySelector(".ant-pagination")).toBeInTheDocument();
  });

  it("keeps expert triage focused on one primary action without repeated row buttons", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/dashboard"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "专家分诊队列" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "处理最高优先级" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "进入审核" })).not.toBeInTheDocument();
    expect(screen.getByText("优先处理列表")).toBeInTheDocument();
    expect(screen.getByText("处方 #1")).toBeInTheDocument();
  });

  it("submits structured prescription edits when approving", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/1"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("频率"), { target: { value: "每周2次" } });
    fireEvent.change(screen.getByLabelText("强度"), { target: { value: "低强度" } });
    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "每次15-20分钟" } });
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "快走，八段锦" } });
    fireEvent.change(screen.getByLabelText("总量"), { target: { value: "每周45-60分钟" } });
    fireEvent.change(screen.getByLabelText("进阶"), { target: { value: "2周后根据血压和RPE再调整" } });
    fireEvent.change(screen.getByLabelText("注意事项"), { target: { value: "运动前后监测血压，出现头晕胸闷立即停止" } });
    fireEvent.change(screen.getByLabelText("禁忌动作"), { target: { value: "憋气用力，大重量抗阻" } });
    fireEvent.change(screen.getByLabelText("复评安排"), { target: { value: "2周复评" } });
    fireEvent.change(screen.getByLabelText("安全提示"), { target: { value: "专家已降低起始运动量。" } });
    fireEvent.click(screen.getByRole("button", { name: "核对后发布处方" }));
    expect(screen.getByText("已核对风险规则、禁忌动作和处方强度")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("确认已核对风险规则、禁忌动作和处方强度"));
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));

    await waitFor(() => {
      expect(approvePrescriptionMock).toHaveBeenCalledWith(1, {
        review_comment: "已核查风险规则、RAG 证据、模板来源和禁忌动作，同意发布。",
        edited_prescription: {
          fitt_vp: {
            frequency: "每周2次",
            intensity: "低强度",
            time: "每次15-20分钟",
            type: ["快走", "八段锦"],
            volume: "每周45-60分钟",
            progression: "2周后根据血压和RPE再调整"
          },
          precautions: ["运动前后监测血压", "出现头晕胸闷立即停止"],
          contraindications: ["憋气用力", "大重量抗阻"],
          reassessment: "2周复评",
          safety_notice: "专家已降低起始运动量。"
        }
      });
    });
  });

  it("filters queue and supports request-info and pause actions", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "筛选队列" }));
    const filterDialog = await screen.findByRole("dialog", { name: "筛选审核队列" });
    fireEvent.change(within(filterDialog).getByLabelText("风险等级"), { target: { value: "R2" } });
    fireEvent.change(within(filterDialog).getByLabelText("审核状态"), { target: { value: "PENDING_REVIEW" } });
    fireEvent.change(within(filterDialog).getByLabelText("机构"), { target: { value: "6" } });
    fireEvent.change(within(filterDialog).getByLabelText("处方类型"), { target: { value: "training" } });
    fireEvent.click(within(filterDialog).getByLabelText("仅异常反馈"));
    fireEvent.click(within(filterDialog).getByRole("button", { name: "应用筛选" }));

    await waitFor(() =>
      expect(listReviewQueueMock).toHaveBeenLastCalledWith(expect.objectContaining({
        organization_id: 6,
        prescription_type: "training",
        abnormal_feedback: true
      }))
    );
  });

  it("supports request-info and pause actions on the detail page", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/1"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "要求补充资料" }));
    await waitFor(() =>
      expect(requestMoreInformationMock).toHaveBeenCalledWith(1, {
        review_comment: "请补充近期血压、血糖或异常反馈相关资料。",
        edited_prescription: {}
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "暂停运动" }));
    await waitFor(() =>
      expect(pausePrescriptionMock).toHaveBeenCalledWith(1, {
        review_comment: "异常反馈或资料不足期间暂停运动，待复核后恢复。",
        edited_prescription: {}
      })
    );
  });

  it("does not allow publishing a training prescription for R3 reviews", async () => {
    listReviewQueueMock.mockResolvedValueOnce([
      {
        prescription_id: 3,
        user_id: 8,
        organization_id: 6,
        risk_level: "R3",
        status: "REFERRED",
        prescription_type: "referral",
        abnormal_feedback_count: 0,
        version: 1,
        created_at: "2026-06-02T00:00:00Z",
        review_id: 11
      }
    ]);
    getReviewDetailMock.mockResolvedValueOnce({
      prescription: {
        id: 3,
        risk_level: "R3",
        status: "REFERRED",
        fitt_vp: null,
        precautions: ["医学评估后再确定运动计划"],
        contraindications: ["不发布训练处方"],
        reassessment: "转介后复核",
        safety_notice: "当前仅建议医学评估或转介。",
        evidence_refs: []
      },
      review: { id: 11, status: "PENDING" },
      health_snapshot: {
        profile: { name: "高风险用户" },
        fitness_test: { sbp: 182, dbp: 112, pain_score: 4 }
      },
      risk_rules: [{ code: "R3_RED_FLAG", message: "高风险红旗信号" }],
      evidence_refs: [{ chunk_id: 2, document_title: "运动前筛查", section: "禁忌" }],
      template: { name: "R3转介模板" },
      candidate_actions: []
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/3"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #3")).toBeInTheDocument();
    expect(screen.getByText("R3 不进入训练处方编辑")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核对后发布处方" })).not.toBeInTheDocument();
    expect(approvePrescriptionMock).not.toHaveBeenCalled();
  });

  it("opens the requested review id and supports the product review workflow", async () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/2"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #2")).toBeInTheDocument();
    expect(getReviewDetailMock).toHaveBeenLastCalledWith(2);
    expect(await screen.findByText("姓名：详情用户")).toBeInTheDocument();
    expect(screen.getByText("六类数据")).toBeInTheDocument();
    fireEvent.click(screen.getByText("六类数据"));
    expect(screen.getByText("体成分：体脂 32%，骨骼肌 21kg")).toBeInTheDocument();
    expect(screen.getByText("生化：空腹血糖 7.1，LDL-C 3.8")).toBeInTheDocument();
    fireEvent.click(screen.getByText("趋势与历史版本"));
    expect(screen.getByText("趋势：血压 150/95 → 146/91；完成率 58% → 72%")).toBeInTheDocument();
    expect(screen.getByText("趋势与历史版本")).toBeInTheDocument();
    expect(screen.getByText("v2 待补充资料 专家要求补充资料")).toBeInTheDocument();
    expect(screen.getByText("系统初稿")).toBeInTheDocument();
    expect(screen.getByText("结构化差异")).toBeInTheDocument();
    expect(screen.getByText("强度：系统建议 低强度 → 当前 中等强度")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "证据" }));
    expect(screen.getAllByText("糖尿病运动指南").length).toBeGreaterThan(0);
    expect(screen.getByText("从低强度开始并监测血糖")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "审计" }));
    expect(screen.getByLabelText("审核意见")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始审核" }));
    await waitFor(() => expect(startReviewMock).toHaveBeenCalledWith(2));
    expect(screen.getByText("已开始审核处方 #2，审核状态已写入审计日志。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("审核意见"), { target: { value: "降低强度后发布，补充血糖监测提醒。" } });
    fireEvent.change(screen.getByLabelText("强度"), { target: { value: "低强度" } });
    fireEvent.click(screen.getByRole("button", { name: "核对后发布处方" }));
    fireEvent.click(screen.getByLabelText("确认已核对风险规则、禁忌动作和处方强度"));
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));
    await waitFor(() =>
      expect(approvePrescriptionMock).toHaveBeenCalledWith(2, expect.objectContaining({
        review_comment: "降低强度后发布，补充血糖监测提醒。",
        edited_prescription: expect.objectContaining({
          fitt_vp: expect.objectContaining({ intensity: "低强度" })
        })
      }))
    );

    fireEvent.click(screen.getByRole("button", { name: "驳回重生成" }));
    await waitFor(() =>
      expect(rejectPrescriptionMock).toHaveBeenCalledWith(2, {
        review_comment: "降低强度后发布，补充血糖监测提醒。",
        edited_prescription: {}
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "转介" }));
    await waitFor(() =>
      expect(referPrescriptionMock).toHaveBeenCalledWith(2, {
        review_comment: "降低强度后发布，补充血糖监测提醒。",
        edited_prescription: {}
      })
    );
  });

  it("renders candidate actions without duplicate key warnings when action ids are absent", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getReviewDetailMock.mockResolvedValueOnce({
      prescription: {
        id: 4,
        risk_level: "R2",
        status: "PENDING_REVIEW",
        fitt_vp: null,
        precautions: [],
        contraindications: [],
        reassessment: "4周复评",
        safety_notice: "待审核。",
        evidence_refs: []
      },
      review: { id: 14, status: "PENDING" },
      health_snapshot: { profile: { name: "候选动作用户" } },
      risk_rules: [],
      evidence_refs: [],
      template: { name: "无 id 候选动作模板" },
      candidate_actions: [
        { name: "快走", contraindication_tags: ["胸痛"] },
        { name: "八段锦", contraindication_tags: ["头晕"] }
      ]
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/4"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("tab", { name: "证据" }));
    expect(await screen.findByText("快走：禁忌 胸痛")).toBeInTheDocument();
    expect(screen.getByText("八段锦：禁忌 头晕")).toBeInTheDocument();
    expect(consoleErrorSpy.mock.calls.some((call) => call.join(" ").includes("Encountered two children with the same key"))).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("shows an explicit queue error state instead of an empty queue when review queue loading fails", async () => {
    listReviewQueueMock.mockRejectedValueOnce(new Error("queue unavailable"));
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/1"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("审核队列加载失败，请确认专家权限或稍后重试。")).toBeInTheDocument();
    expect(screen.queryByText("暂无待审核处方")).not.toBeInTheDocument();
  });

  it("shows an explicit detail error state and disables publish actions when review detail loading fails", async () => {
    getReviewDetailMock.mockRejectedValueOnce(new Error("detail unavailable"));
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/5"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #1")).toBeInTheDocument();
    expect((await screen.findAllByText("审核详情加载失败，请重新选择任务或稍后重试。")).length).toBeGreaterThan(0);
    expect(screen.getByText("先领取任务，再进入审核详情")).toBeInTheDocument();
    expect(screen.queryByText("FITT-VP 结构化编辑器")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核对后发布处方" })).not.toBeInTheDocument();
  });

  it("shows a read-only preview for unclaimed R2 reviews before editing", async () => {
    listReviewQueueMock.mockResolvedValueOnce([
      {
        prescription_id: 5,
        user_id: 9,
        organization_id: 6,
        risk_level: "R2",
        status: "PENDING_REVIEW",
        prescription_type: "training",
        abnormal_feedback_count: 0,
        version: 1,
        created_at: "2026-06-05T00:00:00Z",
        review_id: 15
      }
    ]);
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/1"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #5")).toBeInTheDocument();
    expect(getReviewDetailMock).toHaveBeenCalled();
    expect((await screen.findAllByText("只读预览")).length).toBeGreaterThan(0);
    expect(screen.getByText("当前为领取前只读预览。可以先查看用户摘要、处方结构和规则证据，开始审核后才能编辑或发布。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始审核并解锁编辑" })).toBeInTheDocument();
    expect(screen.queryByText("FITT-VP 结构化编辑器")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "核对后发布处方" })).not.toBeInTheDocument();
  });

  it("uses the guarded detail prompt when the backend rejects a preview request", async () => {
    getReviewDetailMock.mockImplementationOnce(async () => {
      throw { response: { status: 403 } };
    });
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "EXPERT");

    render(
      <MemoryRouter
        initialEntries={["/expert/reviews/1"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("处方 #1")).toBeInTheDocument();
    expect((await screen.findAllByText("当前接口未开放领取前详情，请先领取任务后查看完整审核详情。")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "开始审核并查看详情" })).toBeInTheDocument();
  });
});
