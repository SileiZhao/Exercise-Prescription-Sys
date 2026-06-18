import { Button, Card, Layout, Typography } from "antd";
import { Link } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";

export function PasswordSupportPage() {
  return (
    <Layout className="login-shell password-support-shell">
      <aside className="login-clinical-panel" aria-label="密码找回安全边界">
        <div className="login-panel-photo" aria-hidden="true" />
        <div className="login-panel-grid" aria-hidden="true" />
        <div className="login-panel-copy">
          <ShieldCheck className="login-shield-icon" aria-hidden="true" />
          <Typography.Title level={1}>凭证重置需完成身份核验</Typography.Title>
          <Typography.Paragraph>
            运动处方、专家审核和科研导出均属于受控医疗场景，账号恢复必须经机构管理员确认。
          </Typography.Paragraph>
        </div>
      </aside>

      <main className="login-form-side">
        <Card className="password-support-card" aria-label="密码找回支持">
          <span className="password-support-icon" aria-hidden="true">
            <KeyRound />
          </span>
          <Typography.Title level={2}>密码找回支持</Typography.Title>
          <Typography.Paragraph className="password-support-lead">
            请联系所在机构管理员核验身份后重置登录凭证。
          </Typography.Paragraph>
          <div className="password-support-steps">
            <div>
              <strong>1. 确认账号归属</strong>
              <span>提供工作邮箱、姓名和所属机构，管理员核对账号状态。</span>
            </div>
            <div>
              <strong>2. 完成线下身份核验</strong>
              <span>高权限账号需确认角色、科室或研究项目授权。</span>
            </div>
            <div>
              <strong>3. 使用临时凭证登录</strong>
              <span>首次登录后系统会要求立即修改密码。</span>
            </div>
          </div>
          <Link to="/login">
            <Button type="primary" block>返回系统登录</Button>
          </Link>
        </Card>
      </main>
    </Layout>
  );
}
