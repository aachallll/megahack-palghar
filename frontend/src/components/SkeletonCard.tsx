export default function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card-clinical space-y-3 ${className}`}>
      <div className="h-4 w-24 rounded skeleton-shimmer" />
      <div className="h-8 w-16 rounded skeleton-shimmer" />
      <div className="h-3 w-full rounded skeleton-shimmer" />
      <div className="h-3 w-3/4 rounded skeleton-shimmer" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-border">
      <div className="h-4 w-20 rounded skeleton-shimmer" />
      <div className="h-4 w-32 rounded skeleton-shimmer" />
      <div className="h-4 w-16 rounded skeleton-shimmer" />
      <div className="h-4 w-24 rounded skeleton-shimmer" />
    </div>
  );
}

export function SkeletonVitalCard() {
  return (
    <div className="card-clinical flex flex-col items-center gap-2">
      <div className="h-3 w-16 rounded skeleton-shimmer" />
      <div className="h-10 w-20 rounded skeleton-shimmer" />
      <div className="h-6 w-16 rounded skeleton-shimmer" />
    </div>
  );
}
