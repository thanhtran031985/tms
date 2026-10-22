// Tách danh sách số container dán từ Excel, email hoặc tin nhắn (task 04). Mỗi mục là một số container tìm thấy,
// đã chuẩn hóa và kiểm tra ISO 6346; không để mục nào bị bỏ qua lặng lẽ nếu nó trông như số container nhưng sai.
import { normalizeContainerNo, validateContainerNo } from './iso6346';

export type ContainerListItem = {
  /** Thứ tự mục trong danh sách, bắt đầu từ 1. */
  line: number;
  /** Đoạn chữ gốc người dùng dán. */
  raw: string;
  /** Số đã chuẩn hóa; có thể vẫn sai định dạng nếu `valid` là false. */
  containerNo: string;
  /** Đúng định dạng, đúng số kiểm tra và không trùng mục trước. */
  valid: boolean;
  error: string | null;
  /** `line` của mục đầu tiên có cùng số, hoặc null. */
  duplicateOf: number | null;
};

// 4 chữ + 6 số + 1 số kiểm tra, cho phép khoảng trắng, gạch nối, dấu chấm giữa các nhóm (vd. "MSKU 123456 5").
const FOUND = /(?<![A-Z0-9])[A-Z]{3}[UJZ][\s\-.]?\d{6}[\s\-.]?\d(?![A-Z0-9])/g;
// Đoạn còn lại trông như số container nhưng sai (thiếu hoặc thừa số), cần báo thay vì bỏ qua.
const LOOKS_LIKE = /^[A-Z]{4}\d{4,}$/;
// Dòng không chứa số container và gần như không có chữ số (tiêu đề, ghi chú) thì bỏ qua.
const MIN_DIGITS_TO_REPORT = 4;

type Candidate = { raw: string; at: number };

function candidatesOf(entry: string): Candidate[] {
  const text = entry.toUpperCase();
  const found: Candidate[] = [];
  let rest = text;
  for (const match of text.matchAll(FOUND)) {
    found.push({ raw: match[0], at: match.index });
    rest =
      rest.slice(0, match.index) +
      ' '.repeat(match[0].length) +
      rest.slice(match.index + match[0].length);
  }
  if (found.length > 0) {
    // Có số hợp lệ về định dạng trong dòng: các cụm còn lại gần giống số container cũng phải báo.
    for (const token of rest.matchAll(/\S+/g)) {
      const cleaned = token[0].replace(/[^A-Z0-9]/g, '');
      if (LOOKS_LIKE.test(cleaned)) found.push({ raw: token[0], at: token.index });
    }
  } else {
    const digits = (text.match(/\d/g) ?? []).length;
    if (digits >= MIN_DIGITS_TO_REPORT) found.push({ raw: entry.trim(), at: 0 });
  }
  return found.sort((a, b) => a.at - b.at);
}

export function parseContainerList(text: string): ContainerListItem[] {
  const items: ContainerListItem[] = [];
  const firstLineOf = new Map<string, number>();

  for (const entry of text.split(/[\r\n,;\t]+/)) {
    if (!entry.trim()) continue;
    for (const candidate of candidatesOf(entry)) {
      const check = validateContainerNo(candidate.raw);
      const line = items.length + 1;
      let duplicateOf: number | null = null;
      let error = check.ok ? null : check.error;

      if (check.ok) {
        const first = firstLineOf.get(check.containerNo);
        if (first === undefined) firstLineOf.set(check.containerNo, line);
        else {
          duplicateOf = first;
          error = `Trùng với mục ${first} trong danh sách.`;
        }
      }
      items.push({
        line,
        raw: candidate.raw.trim(),
        containerNo: check.containerNo || normalizeContainerNo(candidate.raw),
        valid: error === null,
        error,
        duplicateOf,
      });
    }
  }
  return items;
}
