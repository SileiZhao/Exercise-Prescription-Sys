import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { lazyPageLoaders } from "./routeLoaders";

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("./api/auth", () => ({
  changePassword: vi.fn(),
  getCurrentUser: getCurrentUserMock,
  login: vi.fn(),
  logout: vi.fn(),
  registerUser: vi.fn()
}));

vi.mock("./api/userDashboard", () => ({
  getUserDashboard: vi.fn().mockResolvedValue({
    current_risk_level: "R1",
    review_status_label: "已发布",
    today_can_exercise: true,
    weekly_completion_rate: 76,
    current_stage_goals: ["改善心肺"],
    prescription_summary: {
      fitt_vp: {
        frequency: "每周3次",
        intensity: "中等强度",
        time: "30分钟",
        type: ["快走"],
        progression: "2周后评估"
      },
      cluster_label: "心肺改善型"
    },
    prescription_version: 2,
    expert_review_status: "已通过",
    recent_feedback: null,
    streak_days: 3,
    weekly_target_hits: 2,
    abnormal_feedback_count: 0,
    monitoring_reminders: [],
    plan_completion_trend: []
  })
}));

vi.mock("./api/prescriptions", () => ({
  exportPrescriptionPdfReport: vi.fn(),
  exportPrescriptionReport: vi.fn(),
  generatePrescription: vi.fn(),
  listReportExportRecords: vi.fn().mockResolvedValue({ items: [] }),
  listMyPrescriptions: vi.fn().mockResolvedValue([
    {
      id: 88,
      status: "PUBLISHED",
      risk_level: "R1",
      version: 2,
      cluster_label: "心肺改善型",
      fitt_vp: {
        frequency: "每周3次",
        intensity: "中等强度",
        time: "30分钟",
        type: ["快走"],
        volume: "90分钟/周",
        progression: "2周后评估"
      },
      precautions: ["胸痛立即停止"],
      contraindications: ["憋气发力"],
      safety_notice: "监测 RPE"
    }
  ])
}));

vi.mock("./api/feedback", () => ({
  createExerciseFeedback: vi.fn(),
  exportPhaseAssessmentPdfReport: vi.fn(),
  exportPhaseAssessmentReport: vi.fn(),
  getPhaseAssessment: vi.fn().mockResolvedValue({
    prescription_id: 88,
    weeks: 4,
    feedback_count: 0,
    average_completion_rate: 0,
    average_rpe: 0,
    pain_events: 0,
    discomfort_events: 0,
    red_alert_events: 0,
    decision: "NO_DATA",
    summary: "暂无阶段反馈数据。",
    recommendations: []
  })
}));

vi.mock("./api/healthData", () => ({
  acceptConsent: vi.fn(),
  createBiochemicalIndex: vi.fn(),
  createBodyComposition: vi.fn(),
  createFitnessTest: vi.fn(),
  getHealthSnapshot: vi.fn().mockResolvedValue(null),
  createRiskScreening: vi.fn(),
  upsertProfile: vi.fn()
}));

vi.mock("./api/expertReviews", () => ({
  approvePrescription: vi.fn(),
  getReviewDetail: vi.fn().mockResolvedValue({
    prescription: { fitt_vp: {}, precautions: [], contraindications: [] },
    health_snapshot: { profile: {}, fitness_test: {} },
    risk_rules: [],
    evidence_refs: [],
    candidate_actions: [],
    template: {}
  }),
  getReviewStats: vi.fn().mockResolvedValue({ r2_pending_count: 0, average_review_hours: 0, timeout_count: 0 }),
  listReviewQueue: vi.fn().mockResolvedValue([]),
  pausePrescription: vi.fn(),
  referPrescription: vi.fn(),
  requestMoreInformation: vi.fn(),
  rejectPrescription: vi.fn()
}));

vi.mock("./api/adminDashboard", () => ({
  getAdminDashboardSummary: vi.fn().mockResolvedValue({
    total_users: 12,
    r2_review_rate: 0.8,
    r3_referral_count: 1,
    feedback_stats: { average_completion_rate: 72 },
    prescription_status: {},
    template_usage: { approved_templates: 4 },
    risk_distribution: {},
    review_stats: {},
    cluster_distribution: {},
    reference_data_status: null
  })
}));

vi.mock("./api/adminUsers", () => ({
  createUser: vi.fn(),
  listUsers: vi.fn().mockResolvedValue([]),
  updateUser: vi.fn()
}));

vi.mock("./api/adminRules", () => ({
  createRiskRule: vi.fn(),
  listRiskRules: vi.fn().mockResolvedValue([]),
  updateRiskRuleStatus: vi.fn()
}));

vi.mock("./api/adminContent", () => ({
  createExerciseAction: vi.fn(),
  createKnowledgeDocument: vi.fn(),
  createPrescriptionTemplate: vi.fn(),
  listComplianceMaterials: vi.fn().mockResolvedValue([]),
  listExerciseActions: vi.fn().mockResolvedValue([]),
  listKnowledgeDocuments: vi.fn().mockResolvedValue({ total: 0, items: [] }),
  listPrescriptionTemplates: vi.fn().mockResolvedValue([]),
  reindexKnowledge: vi.fn(),
  reviewExerciseAction: vi.fn(),
  searchKnowledge: vi.fn().mockResolvedValue([]),
  updateKnowledgeDocument: vi.fn()
}));

vi.mock("./api/clusters", () => ({
  listClusterModels: vi.fn().mockResolvedValue([]),
  trainClusterModel: vi.fn(),
  updateClusterModelStatus: vi.fn()
}));

vi.mock("./api/adminAudit", () => ({
  listAuditLogs: vi.fn().mockResolvedValue({ total: 0, items: [] })
}));

vi.mock("./api/researchExport", () => ({
  createResearchExportRequest: vi.fn(),
  downloadResearchExportRequest: vi.fn(),
  exportDesensitizedUsers: vi.fn().mockResolvedValue({ total: 0, items: [] }),
  getResearchSummary: vi.fn().mockResolvedValue({
    total_participants: 0,
    risk_distribution: {},
    cluster_distribution: {},
    prescription_status: {},
    intervention_effects: {
      feedback_count: 0,
      average_completion_rate: 0,
      average_rpe: 0,
      discomfort_event_count: 0,
      pain_worsened_count: 0
    }
  }),
  listResearchExportRequests: vi.fn().mockResolvedValue([])
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    getCurrentUserMock.mockReset();
  });

  it("renders the platform shell", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("启衡临床运动干预中台首页")).toBeInTheDocument();
    expect(screen.getByText("启衡临床运动干预中台")).toBeInTheDocument();
    expect(screen.getByText("普通用户")).toBeInTheDocument();
    expect(screen.getByText("处方专家")).toBeInTheDocument();
    expect(screen.getByText("系统管理")).toBeInTheDocument();
    expect(screen.getByText("科研人员")).toBeInTheDocument();
    expect(document.querySelectorAll(".public-home-shell .ant-btn-primary")).toHaveLength(1);
  });

  it("keeps the public home page to one primary action for signed-in users", () => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "USER");

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "进入我的工作台" })).toBeInTheDocument();
    expect(document.querySelectorAll(".public-home-shell .ant-btn-primary")).toHaveLength(1);
  });

  it("registers protected workspaces as lazy route modules", () => {
    expect(Object.keys(lazyPageLoaders).sort()).toEqual([
      "adminAudit",
      "adminClusters",
      "adminDashboard",
      "adminRules",
      "adminTemplates",
      "adminUsers",
      "changePassword",
      "expertReview",
      "login",
      "onboarding",
      "passwordSupport",
      "phaseReport",
      "phenotype",
      "prescription",
      "register",
      "researchExport",
      "todayExercise",
      "userDashboard"
    ]);
  });

  it.each([
    ["/user/profile", "健康建档向导", "USER"],
    ["/user/health-data", "健康建档向导", "USER"],
    ["/user/risk-result", "风险评估结果", "USER"],
    ["/user/prescriptions/88", "最新运动处方", "USER"],
    ["/user/feedback", "今日运动打卡", "USER"],
    ["/user/follow-up-report", "阶段评估报告", "USER"],
    ["/expert/dashboard", "紧急分诊与队列", "EXPERT"],
    ["/expert/reviews/88", "单任务审核工作台", "EXPERT"],
    ["/admin/exercises", "动作库管理", "ADMIN"],
    ["/admin/knowledge", "知识库管理", "ADMIN"],
    ["/admin/clustering", "聚类模型生命周期", "ADMIN"],
    ["/admin/research-export", "科研导出审批", "ADMIN"],
    ["/research/dashboard", "宏观统计大盘", "RESEARCHER"],
    ["/research/cluster-analysis", "人群聚类分析", "RESEARCHER"],
    ["/research/intervention-effects", "群体干预效果", "RESEARCHER"],
    ["/research/export-jobs", "数据导出审批", "RESEARCHER"]
  ])("renders required route alias %s", async (path, expectedHeading, role) => {
    localStorage.setItem("access_token", "test-token");
    getCurrentUserMock.mockResolvedValue({
      id: 1,
      email: `${String(role).toLowerCase()}@example.com`,
      full_name: "测试账号",
      role,
      organization_id: role === "USER" ? null : 1,
      is_active: true,
      is_verified: true,
      must_change_password: false
    });

    render(
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect((await screen.findAllByRole("heading", { name: expectedHeading }, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText("启衡运动处方系统")).not.toBeInTheDocument();
  });
});
