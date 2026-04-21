export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

export function calculateTotals(
  lineItems: { quantity: number; unit_price: number }[],
  taxRate: number
) {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

export function statusColor(status: string): string {
  switch (status) {
    case "draft": return "#6B7280";
    case "sent": return "#3B82F6";
    case "viewed": return "#EAB308";
    case "accepted": return "#22C55E";
    case "declined": return "#EF4444";
    default: return "#6B7280";
  }
}
