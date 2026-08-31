import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { HomePage } from "@/pages/Home";
import { LoginPage } from "@/pages/Login";
import { SignupPage } from "@/pages/Signup";
import { OwnerLayout } from "@/pages/owner/OwnerLayout";
import { OwnerDashboardPage } from "@/pages/owner/Dashboard";
import { OwnerProjectNewPage } from "@/pages/owner/ProjectNew";
import { OwnerProjectDetailPage } from "@/pages/owner/ProjectDetail";
import { ContractorLayout } from "@/pages/contractor/ContractorLayout";
import { ContractorFeedPage } from "@/pages/contractor/Feed";
import { ContractorVerifyPage } from "@/pages/contractor/Verify";
import { ContractorStatusPage } from "@/pages/contractor/Status";
import { ContractorOfferPage } from "@/pages/contractor/Offer";
import { ContractorSubscribePage } from "@/pages/contractor/Subscribe";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminRequirementsPage } from "@/pages/admin/Requirements";
import { AdminReviewPage } from "@/pages/admin/Review";
import { AdminContractorsPage } from "@/pages/admin/Contractors";
import { AdminContractorDetailPage } from "@/pages/admin/ContractorDetail";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route
          path="/owner"
          element={
            <ProtectedRoute role="owner">
              <OwnerLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<OwnerDashboardPage />} />
          <Route path="projects/new" element={<OwnerProjectNewPage />} />
          <Route path="projects/:id" element={<OwnerProjectDetailPage />} />
        </Route>

        <Route
          path="/contractor/verify"
          element={
            <ProtectedRoute role="contractor">
              <ContractorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ContractorVerifyPage />} />
        </Route>
        <Route
          path="/contractor/status"
          element={
            <ProtectedRoute role="contractor">
              <ContractorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ContractorStatusPage />} />
        </Route>
        <Route
          path="/contractor"
          element={
            <ProtectedRoute role="contractor" gate>
              <ContractorLayout />
            </ProtectedRoute>
          }
        >
          <Route path="feed" element={<ContractorFeedPage />} />
          <Route path="subscribe" element={<ContractorSubscribePage />} />
          <Route path="projects/:id/offer" element={<ContractorOfferPage />} />
        </Route>

        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="requirements" element={<AdminRequirementsPage />} />
          <Route path="review" element={<AdminReviewPage />} />
          <Route path="contractors" element={<AdminContractorsPage />} />
          <Route path="contractors/:id" element={<AdminContractorDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
