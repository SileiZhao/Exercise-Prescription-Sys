import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

const searchKnowledgeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    {
      document_id: 1,
      document_title: "高血压运动干预指南",
      chunk_id: 1,
      content: "高血压稳定期建议低强度起步，避免憋气。",
      tags: ["高血压", "R2"],
      score: 5
    }
  ])
);
const updateKnowledgeDocumentMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1, status: "ARCHIVED" }));
const reindexKnowledgeMock = vi.hoisted(() => vi.fn().mockResolvedValue({ indexed: 2, skipped: 1 }));

vi.mock("./api/adminContent", () => ({
  createExerciseAction: vi.fn(),
  createKnowledgeDocument: vi.fn(),
  createPrescriptionTemplate: vi.fn(),
  listKnowledgeDocuments: vi.fn().mockResolvedValue({
    total: 1,
    items: [
      {
        id: 1,
        title: "高血压运动干预指南",
        category: "慢病运动",
        source: "专家共识",
        status: "ACTIVE",
        chunk_count: 2,
        created_at: "2026-05-30T10:00:00"
      }
    ]
  }),
  listExerciseActions: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "八段锦",
      category: "传统功法",
      suitable_tags: ["老年功能下降型"],
      contraindication_tags: ["急性损伤"],
      risk_level: "R1",
      body_parts: ["全身"],
      intensity: "低",
      instructions: "呼吸配合缓慢动作。",
      status: "PENDING_REVIEW",
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

describe("admin template workspace", () => {
  it("renders action, template and knowledge management tabs", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("模板库")).toBeInTheDocument();
    expect(screen.getByText("动作库")).toBeInTheDocument();
    expect(screen.getByText("知识库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存动作" })).toBeInTheDocument();
    expect(await screen.findByText("八段锦")).toBeInTheDocument();
    expect(screen.getByText("PENDING_REVIEW")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批准动作" })).toBeInTheDocument();
  });

  it("renders knowledge documents and runs retrieval test", async () => {
    localStorage.setItem("access_token", "test-token");

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("知识库"));
    expect(await screen.findByText("高血压运动干预指南")).toBeInTheDocument();
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
  });

  it("archives a knowledge document from the management table", async () => {
    localStorage.setItem("access_token", "test-token");
    updateKnowledgeDocumentMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("知识库"));
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
    localStorage.setItem("access_token", "test-token");
    reindexKnowledgeMock.mockClear();

    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("知识库"));
    fireEvent.click(await screen.findByRole("button", { name: "重建向量索引" }));

    await waitFor(() => expect(reindexKnowledgeMock).toHaveBeenCalled());
    expect(await screen.findByText("知识向量索引已重建：新增 2 个切片，跳过 1 个已索引切片。")).toBeInTheDocument();
  });
});
