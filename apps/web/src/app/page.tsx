import { TmsMark } from '@/components/brand/tms-mark';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-24">
      <div className="flex items-center gap-10">
        <TmsMark size={32} />
        <h1 className="text-screen-title text-ink">TMS Container</h1>
      </div>
    </main>
  );
}
