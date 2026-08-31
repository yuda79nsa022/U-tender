export type UserRole = "owner" | "contractor" | "admin";
export type ProjectStatus = "open" | "closed" | "awarded" | "canceled";
export type OfferStatus = "submitted" | "approved" | "rejected" | "withdrawn";
export type VerificationStatus = "incomplete" | "pending_review" | "changes_requested" | "approved";
export type DocumentStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface ContractorProfile {
  user_id: string;
  company_name: string;
  license_number: string | null;
  primary_trade: string | null;
  service_area: string | null;
  verification_status: VerificationStatus;
  avg_rating: number;
  review_count: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_current_period_end: string | null;
  created_at: string;
}

export interface DocumentRequirement {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ContractorDocument {
  id: string;
  contractor_id: string;
  requirement_id: string;
  file_path: string | null;
  status: DocumentStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  expires_on: string | null;
}

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  address: string;
  description: string | null;
  trade: string | null;
  bid_deadline: string;
  status: ProjectStatus;
  created_at: string;
}

export interface ProjectDrawing {
  id: string;
  project_id: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
}

export interface Offer {
  id: string;
  project_id: string;
  contractor_id: string;
  amount: number;
  timeline_estimate: string | null;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  project_id: string;
  owner_id: string;
  contractor_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}
