export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="state state--loading">{label}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state state--error">
      <strong>Something went wrong</strong>
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state state--empty">
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}
