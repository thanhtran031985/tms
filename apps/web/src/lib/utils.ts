import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge phải biết token của Design System, nếu không `text-button` (cỡ chữ) bị coi là màu chữ
// và xóa nhầm `text-on-primary`, còn `h-ctl` / `h-hit` không còn ghi đè được nhau.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        '2',
        '4',
        '6',
        '8',
        '10',
        '12',
        '14',
        '16',
        '18',
        '20',
        '28',
        '42',
        '24',
        '32',
        '48',
        '52',
        '64',
        '72',
        'button',
        'hit',
        'ctl',
        'tab',
        'nav',
      ],
      text: [
        'hero-title',
        'screen-title',
        'kpi-figure',
        'section-title',
        'body',
        'body-sm',
        'label',
        'button',
        'small',
        'caption',
        'chip',
        'chip-sm',
        'code',
      ],
      radius: ['chip-sm', 'chip', 'control', 'card-sm', 'card', 'pill'],
      shadow: ['popover', 'drawer'],
      container: ['form', 'form-wide', 'intro', 'content', 'phone'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
