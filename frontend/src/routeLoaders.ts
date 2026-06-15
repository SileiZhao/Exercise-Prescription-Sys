import type { ComponentType } from "react";

type PageModule = Record<string, ComponentType>;

export const lazyPageLoaders = {
  adminAudit: () => import("./pages/admin/AdminAuditPage"),
  adminClusters: () => import("./pages/admin/AdminClustersPage"),
  adminDashboard: () => import("./pages/admin/AdminDashboardPage"),
  adminRules: () => import("./pages/admin/AdminRulesPage"),
  adminTemplates: () => import("./pages/admin/AdminTemplatePage"),
  adminUsers: () => import("./pages/admin/AdminUsersPage"),
  changePassword: () => import("./pages/ChangePasswordPage"),
  expertReview: () => import("./pages/expert/ExpertReviewPage"),
  login: () => import("./pages/LoginPage"),
  onboarding: () => import("./pages/user/OnboardingWizardPage"),
  phaseReport: () => import("./pages/user/PhaseReportPage"),
  phenotype: () => import("./pages/user/PhenotypePage"),
  prescription: () => import("./pages/user/PrescriptionPage"),
  register: () => import("./pages/RegisterPage"),
  researchExport: () => import("./pages/research/ResearchExportPage"),
  todayExercise: () => import("./pages/user/TodayExercisePage"),
  userDashboard: () => import("./pages/user/UserDashboardPage")
} satisfies Record<string, () => Promise<PageModule>>;
