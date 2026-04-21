export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "declined";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Quote {
  id: string;
  contractor_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  job_address: string;
  scope_of_work: string | null;
  line_items: LineItem[];
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: QuoteStatus;
  public_token: string;
  valid_days: number;
  notes: string | null;
  accepted_at: string | null;
  viewed_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorProfile {
  id: string;
  user_id: string;
  business_name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  license_number: string | null;
  default_payment_terms: string | null;
  default_footer: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan: "free" | "pro";
  quotes_used_this_month: number;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}
