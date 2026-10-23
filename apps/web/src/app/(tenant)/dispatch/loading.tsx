import { BoardSkeleton } from '@/features/dispatch/board-skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-16">
      <h1 className="m-0 text-screen-title text-ink">Điều vận</h1>
      <BoardSkeleton />
    </div>
  );
}
