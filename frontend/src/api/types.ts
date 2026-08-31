export type ProjectStatus = "open" | "closed" | "awarded" | "canceled";
export type OfferStatus = "submitted" | "approved" | "rejected" | "withdrawn";
export type VerificationStatus = "incomplete" | "pending_review" | "changes_requested" | "approved";
export type DocumentStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

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
  offer_count: number;
  my_offer_status: OfferStatus | null;
}

export interface Drawing {
  id: string;
  file_name: string;
  uploaded_at: string;
  url: string | null;
}

export interface ProjectDetail extends Project {
  drawings: Drawing[];
}

export interface Offer {
  id: string;
  project_id: string;
  contractor_id: string;
  amount: string;
  timeline_estimate: string | null;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
  contractor_company_name?: string | null;
  contractor_avg_rating?: string | null;
  contractor_review_count?: number | null;
}

export interface ContractorProfile {
  user_id: string;
  company_name: string;
  license_number: string | null;
  primary_trade: string | null;
  service_area: string | null;
  verification_status: VerificationStatus;
  is_suspended: boolean;
  avg_rating: string;
  review_count: number;
  subscription_status: SubscriptionStatus | null;
  subscription_current_period_end: string | null;
  created_at: string;
  email?: string | null;
}

export interface DocumentRequirement {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ContractorDocument {
  id: string;
  contractor_id: string;
  requirement_id: string;
  status: DocumentStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  requirement_name: string | null;
  requirement_description: string | null;
  requirement_is_required: boolean | null;
}
