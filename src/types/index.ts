export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "declined";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

/** Form-state variant of LineItem where numeric fields can be blank strings for empty inputs */
export interface LineItemFormData {
  id: string;
  description: string;
  quantity: number | "";
  unit_price: number | "";
}

export interface QuoteOption {
  id: string;
  quote_id: string;
  name: string;
  description: string | null;
  line_items: LineItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  sort_order: number;
  created_at: string;
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
  is_multi_option: boolean;
  selected_option_id: string | null;
  accepted_at: string | null;
  viewed_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotePhoto {
  id: string;
  quote_id: string;
  storage_path: string;
  position: number;
  created_at: string;
  /** Resolved public URL (populated at fetch time, not a DB column). */
  url?: string;
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
  auto_reminder_enabled: boolean;
  auto_reminder_hours: number;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Invoice {
  id: string;
  invoice_number: string;
  contractor_id: string;
  quote_id: string | null;
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
  due_date: string | null;
  payment_status: PaymentStatus;
  amount_paid: number;
  public_token: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  line_items: LineItem[];
  tax_rate: number;
  scope_of_work: string | null;
  valid_days: number;
  created_at: string;
  updated_at: string;
}

export type ReminderStatusType = "pending" | "sent" | "cancelled";
export type ReminderType = "auto_followup" | "manual";

export interface QuoteReminder {
  id: string;
  quote_id: string;
  reminder_type: ReminderType;
  scheduled_for: string;
  sent_at: string | null;
  status: ReminderStatusType;
  message: string | null;
  created_at: string;
}

export interface SavedLineItem {
  id: string;
  user_id: string;
  description: string;
  unit_price: number;
  category: string | null;
  created_at: string;
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
