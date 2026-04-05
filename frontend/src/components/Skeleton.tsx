interface SkeletonProps {
  className?: string;
}

/** Single skeleton line/block with shimmer animation. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton rounded ${className}`} />;
}

/** Skeleton for a GameRow table row (desktop). */
export function GameRowSkeleton() {
  return (
    <tr className="h-14 border-b border-border-dark/30">
      <td className="px-6 py-2">
        <div className="flex items-center gap-3">
          <Skeleton className="w-[72px] h-[34px] flex-shrink-0" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="w-40 h-3" />
            <Skeleton className="w-24 h-2" />
          </div>
        </div>
      </td>
      <td className="px-4 py-2 text-center"><Skeleton className="w-8 h-5 mx-auto" /></td>
      <td className="px-4 py-2"><Skeleton className="w-10 h-4" /></td>
      <td className="px-4 py-2"><Skeleton className="w-12 h-4" /></td>
      <td className="px-4 py-2"><Skeleton className="w-10 h-4" /></td>
      <td className="px-4 py-2"><Skeleton className="w-8 h-4" /></td>
      <td className="px-4 py-2"><Skeleton className="w-12 h-4" /></td>
      <td className="px-4 py-2"><Skeleton className="w-28 h-5" /></td>
      <td className="px-6 py-2 text-right"><Skeleton className="w-10 h-7 ml-auto" /></td>
    </tr>
  );
}

/** Skeleton for a GameCard (mobile). */
export function GameCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border-dark/30">
      <div className="flex items-start gap-3">
        <Skeleton className="w-14 h-[26px] flex-shrink-0 mt-0.5" />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton className="w-36 h-3" />
          <Skeleton className="w-20 h-2" />
        </div>
        <Skeleton className="w-8 h-8 flex-shrink-0" />
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Skeleton className="w-8 h-4" />
        <Skeleton className="w-10 h-4" />
        <Skeleton className="w-14 h-4" />
      </div>
    </div>
  );
}

/** Full-page loading state showing N skeleton rows. */
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <GameRowSkeleton key={i} />
      ))}
    </>
  );
}
