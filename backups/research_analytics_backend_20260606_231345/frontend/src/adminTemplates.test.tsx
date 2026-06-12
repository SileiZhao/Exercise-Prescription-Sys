import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const searchKnowledgeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      document_id: 1,
      document_title: "高血压运动干预指南",
      chunk_id: 1,
      content: "高血压稳定期建议低强度起步，避免憋气。",
      tags: ["高血压", "R2"],
      score: 5,
      source_type: "指南",
      version: "2024",
      section: "运动原则",
      page_start: 3,
      page_end: 4,
      credibility_level: "high",
      retrieval_mode: "keyword_fallback",
      fallback_reason: "vector store unavailable",
      document_status: "INDEX_FAILED",
      document_skipped_reason: "索引失败：向量服务不可用"
    }
  ])
);
const updateKnowledgeDocumentMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1, status: "ARCHIVED" }));
const reindexKnowledgeMock = vi.hoisted(() => vi.fn().mockResolvedValue({ indexed: 2, skipped: 1 }));
const uploadKnowledgeDocumentMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 3, title: "上传运动指南", status: "ACTIVE" }));
const updatePrescriptionTemplateMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 10,
    name: "R2 高血压稳定型模板（更新）",
    risk_level: "R2",
    cluster_tags: ["高血压", "慢病稳定型"],
    goal_tags: ["血压管理辅助"],
    fitt_vp: {
      frequency: "每周3-5次",
      intensity: "低强度起步",
      time: "每次20-40分钟",
      type: ["快走"],
      volume: "150分钟/周",
      progression: "每2-4周调整"
    },
    precautions: ["必须专家审核后发布"],
    contraindications: ["高强度间歇"],
    evidence_refs: ["Exercise is Medicine Rx for Health: Hypertension"],
    status: "APPROVED",
    review_status: "APPROVED",
    version: 2,
    created_at: "2026-06-01T10:00:00",
    updated_at: "2026-06-03T10:00:00"
  })
);
const updateExerciseActionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1, name: "八段锦（更新）" }));
const listAuditLogsMock = vi.hoisted(() =>
  vi.fn((params?: Record<string, unknown>) =>
    Promise.resolve({
      total: 1,
      items:
        params?.resource_type === "KnowledgeDocument"
          ? [
              {
                id: 100,
                actor_id: 1,
                action: "UPDATE_KNOWLEDGE_DOCUMENT_STATUS",
                resource_type: "KnowledgeDocument",
                resource_id: "1",
                metadata: { status: "ACTIVE", title: "高血压运动干预指南" },
                created_at: "2026-06-03T10:00:00"
              }
            ]
          : [
              {
                id: 99,
                actor_id: 1,
                action: "UPDATE_PRESCRIPTION_TEMPLATE",
                resource_type: "PrescriptionTemplate",
                resource_id: "10",
                metadata: {
                  version_before: 1,
                  version_after: 2,
                  changes: { name: { before: "R2 高血压稳定型模板", after: "R2 高血压稳定型模板（更新）" } }
                },
                created_at: "2026-06-03T10:00:00"
              }
            ]
    })
  )
);

vi.mock("./api/adminContent", () => ({
  createExerciseAction: vi.fn(),
  createKnowledgeDocument: vi.fn(),
  uploadKnowledgeDocument: uploadKnowledgeDocumentMock,
  createPrescriptionTemplate: vi.fn(),
  updateExerciseAction: updateExerciseActionMock,
  updatePrescriptionTemplate: updatePrescriptionTemplateMock,
  listPrescriptionTemplates: vi.fn().mockResolvedValue([
    {
      id: 10,
      name: "R2 高血压稳定型模板",
      risk_level: "R2",
      cluster_tags: ["高血压", "慢病稳定型"],
      goal_tags: ["血压管理辅助"],
      fitt_vp: {
        frequency: "每周3-5次",
        intensity: "低强度起步",
        time: "每次20-40分钟",
        type: ["快走"],
        volume: "150分钟/周",
        progression: "每2-4周调整"
      },
      precautions: ["必须专家审核后发布"],
      contraindications: ["高强度间歇"],
      evidence_refs: ["Exercise is Medicine Rx for Health: Hypertension"],
      status: "APPROVED",
      review_status: "APPROVED",
      version: 1,
      created_at: "2026-06-01T10:00:00",
      updated_at: "2026-06-01T10:00:00"
    }
  ]),
	  listKnowledgeDocuments: vi.fn().mockResolvedValue({
    total: 1,
    items: [
      {
        id: 1,
        title: "高血压运动干预指南",
        category: "慢病运动",
        source: "专家共识",
        source_type: "指南",
        version: "2024",
        published_year: "2024",
        import_batch_id: "batch-ui",
        credibility_level: "high",
        status: "ACTIVE",
        chunk_count: 2,
        created_at: "2026-05-30T10:00:00"
      },
      {
        id: 2,
        title: "索引失败示例文档",
        category: "慢病运动",
        source: "专家共识",
        source_type: "指南",
        version: "2024",
        published_year: "2024",
        import_batch_id: "batch-ui",
        credibility_level: "high",
        status: "INDEX_FAILED",
        skipped_reason: "索引失败：向量服务不可用",
        chunk_count: 0,
        created_at: "2026-05-30T10:00:00"
      }
    ]
	  }),
	  listComplianceMaterials: vi.fn().mockResolvedValue([
	    {
	      id: 1,
	      code: "CONSENT",
	      title: "知情同意",
	      version: "v1.0",
	      effective_date: "2026-06-02",
	      applicable_scope: "全部用户",
	      text: "内容",
	      short_notice: "请确认知情同意。",
	      review_status: "CONFIRMED",
	      status: "ACTIVE"
	    }
	  ]),
	  listExerciseActions: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "八段锦",
      source: "专家动作库",
      source_exercise_id: "BDJ-01",
      name_en: "Baduanjin",
      category: "传统功法",
      exercise_type: "traditional_qigong",
      image_url: "https://example.test/baduanjin.png",
      joint_stress_level: "低",
      impact_level: "低",
      requires_equipment: false,
      is_traditional_exercise: true,
      suitable_tags: ["老年功能下降型"],
      contraindication_tags: ["急性损伤"],
      risk_level: "R1",
      body_parts: ["全身"],
      stop_signals: ["胸痛立即停止"],
      evidence_refs: ["WHO 2020"],
      intensity: "低",
      instructions: "呼吸配合缓慢动作。",
      status: "APPROVED",
      review_status: "EXPERT_CONFIRMED",
      reviewed_by: null,
      reviewed_at: null,
      created_at: "2026-05-30T10:00:00"
    }
  ]),
  reviewExerciseAction: vi.fn(),
  reindexKnowledge: reindexKnowledgeMock,
  searchKnowledge: searchKnowledgeMock,
  updateKnowledgeDocument: updateKnowledgeDocumentMock
}));

vi.mock("./api/adminAudit", () => ({
  listAuditLogs: listAuditLogsMock
}));

describe("admin template workspace", () => {
  beforeEach(() => {
    localStorage.setItem("access_token", "test-token");
    localStorage.setItem("current_user_role", "ADMIN");
  });

  it("renders action, template and knowledge management tabs", async () => {
    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("模板库")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "动作库" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "知识库" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "动作库" }));
    expect(screen.getByRole("button", { name: "保存动作" })).toBeInTheDocument();
    expect(await screen.findByText("八段锦")).toBeInTheDocument();
    expect(screen.getByText("Baduanjin")).toBeInTheDocument();
    expect(screen.getByText("关节压力")).toBeInTheDocument();
    expect(screen.getByText("冲击等级")).toBeInTheDocument();
    expect(screen.getByText("传统功法")).toBeInTheDocument();
    expect(screen.getByText("适宜人群")).toBeInTheDocument();
    expect(screen.getByText("停止信号")).toBeInTheDocument();
    expect(screen.getAllByText("证据引用").length).toBeGreaterThan(0);
    expect(screen.getByText("WHO 2020")).toBeInTheDocument();
    expect(screen.getAllByText("已批准").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "批准动作" })).toBeInTheDocument();
  });

  it("renders imported prescription template metadata and details", async () => {
    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText("模板库"));
    expect(await screen.findByText("R2 高血压稳定型模板")).toBeInTheDocument();
    expect(screen.getByText("慢病稳定型")).toBeInTheDocument();
    expect(screen.getByText("血压管理辅助")).toBeInTheDocument();
    expect(screen.getByText("FITT-VP 处方结构")).toBeInTheDocument();
    expect(screen.getByText("频率")).toBeInTheDocument();
    expect(screen.getByText("每周3-5次")).toBeInTheDocument();
    expect(screen.getAllByText("本平台状态：已批准").length).toBeGreaterThan(0);
    expect(screen.queryByText("APPROVED")).not.toBeInTheDocument();
    expect(screen.queryByText(/frequency/)).not.toBeInTheDocument();
    expect(screen.getByText("Exercise is Medicine Rx for Health: Hypertension")).toBeInTheDocument();
  });

  it("opens the template detail drawer with filters, version history, audit logs and real edit API", async () => {
    updatePrescriptionTemplateMock.mockClear();
    listAuditLogsMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText("模板库"));
    expect(await screen.findByText("R2 高血压稳定型模板")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("模板筛选"), { target: { value: "高血压" } });
    expect(screen.getByText("R2 高血压稳定型模板")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看模板详情" }));

    expect(await screen.findByText("模板详情")).toBeInTheDocument();
    expect(screen.getByText("版本历史")).toBeInTheDocument();
    expect(screen.getByText("v1 · 已批准")).toBeInTheDocument();
    expect(screen.getByText("审计日志")).toBeInTheDocument();
    expect(await screen.findByText("UPDATE_PRESCRIPTION_TEMPLATE")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("编辑模板名称"), {
      target: { value: "R2 高血压稳定型模板（更新）" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存模板编辑" }));

    await waitFor(() =>
      expect(updatePrescriptionTemplateMock).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ name: "R2 高血压稳定型模板（更新）" })
      )
    );
  });

  it("renders knowledge documents and runs retrieval test", async () => {
    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("tab", { name: "知识库" }));
    expect(await screen.findByText("高血压运动干预指南")).toBeInTheDocument();
    expect(screen.getByText("索引失败示例文档")).toBeInTheDocument();
    expect(screen.getByText("索引失败：向量服务不可用")).toBeInTheDocument();
    expect(screen.getAllByText("指南").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2024").length).toBeGreaterThan(0);
    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("检索问题"), { target: { value: "高血压如何安排运动" } });
    fireEvent.change(screen.getByLabelText("证据标签"), { target: { value: "高血压，R2" } });
    fireEvent.click(screen.getByRole("button", { name: "检索验证" }));

    await waitFor(() =>
      expect(searchKnowledgeMock).toHaveBeenCalledWith({
        query: "高血压如何安排运动",
        tags: ["高血压", "R2"],
        limit: 5
      })
    );
    expect(await screen.findByText("高血压稳定期建议低强度起步，避免憋气。")).toBeInTheDocument();
    expect(screen.getByText("运动原则")).toBeInTheDocument();
    expect(screen.getByText("3-4")).toBeInTheDocument();
    expect(screen.getByText("索引失败资料，仅关键词召回")).toBeInTheDocument();
    expect(screen.getByText("vector store unavailable")).toBeInTheDocument();
  });

  it("supports knowledge file upload and opens document detail with chunk, vector, version and audit status", async () => {
    uploadKnowledgeDocumentMock.mockClear();
    listAuditLogsMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("tab", { name: "知识库" }));
    expect(await screen.findByText("高血压运动干预指南")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("知识筛选"), { target: { value: "高血压" } });
    expect(screen.getByText("高血压运动干预指南")).toBeInTheDocument();

    const file = new File(["# 运动原则\n高血压稳定期建议低强度起步。"], "upload-guide.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("上传知识文件"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("上传文档标题"), { target: { value: "上传运动指南" } });
    fireEvent.click(screen.getByRole("button", { name: "上传知识文件" }));

    await waitFor(() => expect(uploadKnowledgeDocumentMock).toHaveBeenCalled());
    const uploadedFormData = uploadKnowledgeDocumentMock.mock.calls[0][0] as FormData;
    expect(uploadedFormData.get("title")).toBe("上传运动指南");
    expect(uploadedFormData.get("file")).toBe(file);

    fireEvent.click(screen.getByRole("button", { name: "查看知识详情" }));
    expect(await screen.findByText("知识文档详情")).toBeInTheDocument();
    expect(screen.getByText("切片状态")).toBeInTheDocument();
    expect(screen.getByText("已切片 2 段")).toBeInTheDocument();
    expect(screen.getByText("向量化状态")).toBeInTheDocument();
    expect(screen.getByText("向量化完成")).toBeInTheDocument();
    expect(screen.getByText("版本历史")).toBeInTheDocument();
    expect(screen.getByText("2024 · 指南")).toBeInTheDocument();
    expect(screen.getByText("审计日志")).toBeInTheDocument();
    expect(await screen.findByText("UPDATE_KNOWLEDGE_DOCUMENT_STATUS")).toBeInTheDocument();
  });

  it("archives a knowledge document from the management table", async () => {
    updateKnowledgeDocumentMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("tab", { name: "知识库" }));
    expect(await screen.findByText("高血压运动干预指南")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停用文档" }));

    await waitFor(() =>
      expect(updateKnowledgeDocumentMock).toHaveBeenCalledWith(1, {
        status: "ARCHIVED",
        reason: "管理端停用知识文档"
      })
    );
  });

	  it("rebuilds the knowledge vector index from the knowledge tab", async () => {
    reindexKnowledgeMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("tab", { name: "知识库" }));
    fireEvent.click(await screen.findByRole("button", { name: "重建向量索引" }));

    await waitFor(() => expect(reindexKnowledgeMock).toHaveBeenCalled());
    expect(await screen.findByText("知识向量索引已重建：新增 2 个切片，跳过 1 个已索引切片。")).toBeInTheDocument();
	  });

	  it("renders confirmed compliance material status", async () => {
	    localStorage.setItem("access_token", "test-token");

	    render(
	      <MemoryRouter
	        initialEntries={["/admin/templates"]}
	        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
	      >
	        <App />
	      </MemoryRouter>
	    );

	    fireEvent.click(await screen.findByText("合规材料"));
	    expect(await screen.findByText("知情同意")).toBeInTheDocument();
	    expect(screen.getByText("已确认")).toBeInTheDocument();
	    expect(screen.queryByText(/待法务|专家确认|草案/)).not.toBeInTheDocument();
	  });
	});
