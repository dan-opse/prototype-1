export function formatPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)}`;
}

export function formatReaction(average: number | null): string {
  return average === null ? '—' : average.toFixed(1);
}

export function formatReorder(percentage: number | null): string {
  return percentage === null ? '—' : `${Math.round(percentage)}%`;
}

export function spiceLabel(level: number): string {
  return ['Not spicy', 'Mild', 'Medium', 'Hot'][Math.min(Math.max(level, 0), 3)];
}
