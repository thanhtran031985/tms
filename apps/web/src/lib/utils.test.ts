import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn với token của Design System', () => {
  it('cỡ chữ token không bị coi là màu chữ và không xóa màu chữ', () => {
    expect(cn('text-on-primary', 'text-button')).toBe('text-on-primary text-button');
    expect(cn('text-ink', 'text-body-sm', 'font-semibold')).toBe(
      'text-ink text-body-sm font-semibold',
    );
  });

  it('hai cỡ chữ token cùng nhóm thì lớp sau thắng', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small');
  });

  it('chiều cao / padding token cùng nhóm thì lớp sau thắng', () => {
    expect(cn('h-ctl', 'h-hit')).toBe('h-hit');
    expect(cn('px-20', 'px-14')).toBe('px-14');
    expect(cn('p-16', 'px-14')).toBe('p-16 px-14');
  });

  it('màu nền token cùng nhóm thì lớp sau thắng, bo góc token cùng nhóm thì lớp sau thắng', () => {
    expect(cn('bg-primary', 'bg-surface-2')).toBe('bg-surface-2');
    expect(cn('rounded-control', 'rounded-card')).toBe('rounded-card');
  });
});
