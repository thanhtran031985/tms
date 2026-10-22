'use client';

import { CircleAlert, CircleCheck, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { STOP_TYPES, type StopType } from '@shared/enums';
import { STOP_TYPE_LABELS } from '@shared/labels';
import { Button, IconButton } from '@/components/ui/button';
import { setRouteStopTemplate } from './actions';

// Chuỗi Stop nội địa của một tuyến (task 04): đơn DOMESTIC sinh Stop theo mẫu này. Hiện trong ngăn kéo sửa tuyến.
// Mẫu đã có theo tuyến do trang nạp, truyền qua context để form tuyến của task 02 không đổi giao diện props.
const TemplatesContext = createContext<Record<string, StopType[]>>({});
export const RouteTemplatesProvider = TemplatesContext.Provider;

export function RouteStopTemplateEditor({
  routeId,
  readOnly,
}: {
  routeId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const saved = useContext(TemplatesContext)[routeId] ?? [];
  const [chain, setChain] = useState<StopType[]>(saved);
  const [message, setMessage] = useState<{ tone: 'ok' | 'crit'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await setRouteStopTemplate({ routeId, stopTypes: chain });
      if (result.ok) router.refresh(); // nạp lại mẫu để mở lại ngăn kéo vẫn thấy chuỗi vừa lưu
      setMessage(
        result.ok
          ? { tone: 'ok', text: 'Đã lưu chuỗi Stop. Order đã tạo giữ nguyên Stop của chúng.' }
          : { tone: 'crit', text: result.fieldErrors?.stopTypes?.[0] ?? result.message },
      );
    } catch {
      setMessage({
        tone: 'crit',
        text: 'Không gửi được yêu cầu. Kiểm tra kết nối mạng rồi thử lại.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-12 rounded-card border border-line p-16">
      <legend className="px-6 text-label text-ink">Chuỗi Stop nội địa</legend>
      <p className="text-small text-ink-soft">
        Đơn Nội địa của tuyến này sinh Stop theo thứ tự dưới đây. Đơn Nhập và Xuất luôn dùng chuỗi
        chuẩn.
      </p>
      {chain.length === 0 ? (
        <p className="text-body-sm text-ink-soft">
          Chưa cấu hình. Chưa tạo được đơn Nội địa cho tuyến này.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-8 p-0">
          {chain.map((stopType, index) => (
            <li key={index} className="flex items-center gap-8">
              <span className="w-24 flex-none text-small text-ink-soft">{index + 1}</span>
              <select
                aria-label={`Stop thứ ${index + 1} của chuỗi nội địa`}
                value={stopType}
                disabled={readOnly}
                onChange={(e) =>
                  setChain(chain.map((s, i) => (i === index ? (e.target.value as StopType) : s)))
                }
                className="h-ctl min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-8 text-body-sm text-ink disabled:bg-surface-2 disabled:text-ink-soft"
              >
                {STOP_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {STOP_TYPE_LABELS[value]} ({value})
                  </option>
                ))}
              </select>
              {readOnly ? null : (
                <IconButton
                  aria-label={`Xóa Stop thứ ${index + 1}`}
                  onClick={() => setChain(chain.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-20" aria-hidden="true" />
                </IconButton>
              )}
            </li>
          ))}
        </ol>
      )}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-12">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setChain([...chain, chain.at(-1) ?? 'PICK_EMPTY'])}
          >
            <Plus className="size-18" aria-hidden="true" />
            Thêm Stop
          </Button>
          <Button size="sm" onClick={save} loading={busy} disabled={chain.length === 0}>
            Lưu chuỗi Stop
          </Button>
        </div>
      )}
      {message ? (
        <p
          role={message.tone === 'crit' ? 'alert' : 'status'}
          className={`flex items-start gap-6 text-body-sm ${message.tone === 'crit' ? 'text-crit' : 'text-ok'}`}
        >
          {message.tone === 'crit' ? (
            <CircleAlert className="mt-2 size-16 flex-none" aria-hidden="true" />
          ) : (
            <CircleCheck className="mt-2 size-16 flex-none" aria-hidden="true" />
          )}
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
