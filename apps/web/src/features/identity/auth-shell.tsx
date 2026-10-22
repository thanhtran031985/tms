import type { ReactNode } from 'react';
import { Check, Clock, Container } from 'lucide-react';
import { TmsMark } from '@/components/brand/tms-mark';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import type { Theme } from '@/features/theme/constants';

// Khung hai cột của Screen01-Login: cột giới thiệu bên trái, nội dung (form đăng nhập / chọn công ty) bên phải.
const benefits = [
  {
    title: 'Điều xe theo từng container',
    text: 'Một Order nhiều container, mỗi cont một thẻ trên bảng điều vận.',
    icon: <Container className="size-20" />,
    tone: 'bg-info-soft text-info',
  },
  {
    title: 'Không lỡ cut-off, DEM, DET',
    text: 'Mốc hạn gần nhất luôn hiện đầu trang, kèm giờ còn lại.',
    icon: <Clock className="size-20" />,
    tone: 'bg-warn-soft text-warn',
  },
  {
    title: 'Đối soát và phân bổ chi phí',
    text: 'Chi phí chuyến chia theo định mức, Kế toán sửa được khi cần.',
    icon: <Check className="size-20" />,
    tone: 'bg-ok-soft text-ok',
  },
] as const;

export function AuthShell({ children, theme }: { children: ReactNode; theme: Theme }) {
  return (
    <div className="grid min-h-screen bg-bg text-ink lg:grid-cols-[13fr_12fr]">
      <section
        aria-label="Giới thiệu"
        className="flex flex-col justify-between gap-48 border-b border-line px-24 py-32 lg:border-r lg:border-b-0 lg:px-64 lg:py-48"
      >
        <div className="flex items-center gap-12">
          <TmsMark size={32} />
          <span className="text-section-title font-bold">TMS Container</span>
        </div>

        <div className="flex max-w-intro flex-col gap-32">
          <h1 className="text-screen-title lg:text-hero-title">
            Điều hành vận tải container theo từng mốc hạn
          </h1>
          <ul className="m-0 flex list-none flex-col gap-20 p-0">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex items-start gap-16">
                <span
                  aria-hidden="true"
                  className={`flex size-ctl flex-none items-center justify-center rounded-control ${benefit.tone}`}
                >
                  {benefit.icon}
                </span>
                <span>
                  <strong className="block font-semibold">{benefit.title}</strong>
                  <span className="text-ink-soft">{benefit.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-small text-ink-soft">
          Cần hỗ trợ? Gọi{' '}
          <a
            href="tel:19001234"
            className="text-primary underline underline-offset-4 hover:text-primary-hover"
          >
            1900 1234
          </a>{' '}
          (7:00–22:00).
        </p>
      </section>

      <main className="relative flex flex-col items-center justify-center gap-24 px-24 py-48 lg:px-32">
        <ThemeToggle initial={theme} className="absolute right-24 top-24 h-hit" />
        {children}
      </main>
    </div>
  );
}
