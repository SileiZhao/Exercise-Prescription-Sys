import { Alert, Button, Card, Col, Empty, Layout, List, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  approvePrescription,
  getReviewDetail,
  listReviewQueue,
  referPrescription,
  rejectPrescription,
  type ReviewDetail,
  type ReviewQueueItem
} from "../../api/expertReviews";

export function ExpertReviewPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selected, setSelected] = useState<ReviewQueueItem | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listReviewQueue()
      .then((data) => {
        setItems(data);
        setSelected(data[0] ?? null);
      })
      .catch(() => {
        setItems([]);
      });
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    getReviewDetail(selected.prescription_id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selected]);

  async function handleAction(action: "approve" | "reject" | "refer") {
    if (!selected) {
      return;
    }
    const payload = {
      review_comment:
        action === "approve"
          ? "已核查风险规则、RAG 证据、模板来源和禁忌动作，同意发布。"
          : action === "reject"
            ? "资料或处方安全边界不足，退回修改。"
            : "当前风险需医学评估或线下转介。",
      edited_prescription: {}
    };
    try {
      if (action === "approve") {
        await approvePrescription(selected.prescription_id, payload);
      } else if (action === "reject") {
        await rejectPrescription(selected.prescription_id, payload);
      } else {
        await referPrescription(selected.prescription_id, payload);
      }
      setNotice("审核操作已记录审计日志。");
      const queue = await listReviewQueue();
      setItems(queue);
      setSelected(queue[0] ?? null);
    } catch {
      setNotice("审核操作失败，请检查处方状态和权限。");
    }
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Typography.Title level={3} className="app-title">
          专家审核工作台
        </Typography.Title>
      </Layout.Header>
      <Layout.Content className="app-content expert-review-content">
        {notice ? <Alert className="form-alert" type={notice.includes("失败") ? "error" : "success"} showIcon message={notice} /> : null}
        <Row gutter={16}>
          <Col xs={24} lg={7}>
            <Card title="审核队列" className="expert-panel">
              {items.length ? (
                <List
                  dataSource={items}
                  renderItem={(item) => (
                    <List.Item onClick={() => setSelected(item)} className="review-list-item">
                      <Space direction="vertical" size={4}>
                        <Typography.Text strong>处方 #{item.prescription_id}</Typography.Text>
                        <Space>
                          <Tag color={item.risk_level === "R2" ? "orange" : "red"}>{item.risk_level}</Tag>
                          <Tag>{item.status}</Tag>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="暂无待审核处方" />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={6}>
            <Card title="用户画像" className="expert-panel">
              {detail ? (
                <Space direction="vertical" size={6}>
                  <Typography.Text>{`用户 #${selected?.user_id}，风险等级 ${selected?.risk_level}`}</Typography.Text>
                  <Typography.Text>{`姓名：${String(detail.health_snapshot.profile?.name ?? "-")}`}</Typography.Text>
                  <Typography.Text>{`血压：${String(detail.health_snapshot.fitness_test?.sbp ?? "-")}/${String(detail.health_snapshot.fitness_test?.dbp ?? "-")} mmHg`}</Typography.Text>
                  <Typography.Text>{`疼痛评分：${String(detail.health_snapshot.fitness_test?.pain_score ?? "-")}`}</Typography.Text>
                </Space>
              ) : (
                <Typography.Paragraph>选择审核任务后查看用户六类数据摘要。</Typography.Paragraph>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={6}>
            <Card title="处方编辑" className="expert-panel">
              <Typography.Paragraph>
                {detail?.prescription.fitt_vp
                  ? JSON.stringify(detail.prescription.fitt_vp)
                  : "当前为安全提醒/转介流程，不生成训练处方。"}
              </Typography.Paragraph>
              <Space wrap>
                <Button type="primary" disabled={!selected} onClick={() => handleAction("approve")}>
                  批准
                </Button>
                <Button disabled={!selected} onClick={() => handleAction("reject")}>驳回</Button>
                <Button danger disabled={!selected} onClick={() => handleAction("refer")}>
                  转介
                </Button>
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={5}>
            <Card title="规则证据" className="expert-panel">
              <Space direction="vertical" size={8}>
                <Typography.Text strong>命中规则</Typography.Text>
                {(detail?.risk_rules ?? []).slice(0, 3).map((rule) => (
                  <Typography.Text key={String(rule.code)}>{String(rule.code)}：{String(rule.message)}</Typography.Text>
                ))}
                <Typography.Text strong>RAG 来源</Typography.Text>
                {(detail?.evidence_refs ?? []).slice(0, 3).map((item) => (
                  <Typography.Text key={String(item.chunk_id)}>
                    {String(item.document_title)} {item.section ? ` / ${String(item.section)}` : ""}
                  </Typography.Text>
                ))}
                <Typography.Text strong>模板与动作</Typography.Text>
                <Typography.Text>{String(detail?.template?.name ?? "-")}</Typography.Text>
                {(detail?.candidate_actions ?? []).slice(0, 3).map((action) => (
                  <Typography.Text key={String(action.id)}>{String(action.name)}：禁忌 {String((action.contraindication_tags as string[] | undefined)?.join("、") ?? "-")}</Typography.Text>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
        <Link to="/">
          <Button className="back-button">返回首页</Button>
        </Link>
      </Layout.Content>
    </Layout>
  );
}
