import React from 'react';
import { cn } from '../../utils/cn';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('skeleton rounded-md', className)}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines })?.map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div
      className={cn('rounded-xl border p-5 flex flex-col gap-3', className)}
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="w-9 h-9 rounded-xl" />
      </div>
      <Skeleton className="h-9 w-20" />
      <Skeleton className="h-3 w-36" />
      <div className="pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <Skeleton className="w-5 h-5 rounded" />
      <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-6 w-14 rounded-full" />
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  );
}

export function SkeletonProductForm() {
  return (
    <div className="space-y-5">
      <div className="p-5 rounded-xl border space-y-4" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3]?.map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
      <div className="p-5 rounded-xl border space-y-4" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default Skeleton;
