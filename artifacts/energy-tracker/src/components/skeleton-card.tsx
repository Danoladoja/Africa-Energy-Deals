export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-5 animate-pulse ${className}`}>
      <div className="h-4 bg-muted rounded w-2/3 mb-3" />
      <div className="h-3 bg-muted rounded w-full mb-2" />
      <div className="h-3 bg-muted rounded w-4/5" />
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-muted rounded w-1/2 mb-3" />
      <div className="h-8 bg-muted rounded w-3/4 mb-1" />
      <div className="h-3 bg-muted rounded w-1/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
      <div className="h-12 bg-muted/50 border-b border-border px-6" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0">
          <div className="h-4 bg-muted rounded flex-1" />
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-4 bg-muted rounded w-20" />
          <div className="h-6 bg-muted rounded w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div
      className="bg-card border border-border rounded-xl animate-pulse flex items-end gap-2 px-6 pb-6 pt-12"
      style={{ height }}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-muted rounded-t"
          style={{ height: `${30 + Math.sin(i) * 20 + Math.random() * 40}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted rounded"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}
