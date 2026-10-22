import { describe, expect, it } from 'vitest';
import { parseContainerList } from '@shared/container-list';

const nos = (text: string) => parseContainerList(text).map((item) => item.containerNo);

describe('tách danh sách số container dán từ Excel, email', () => {
  it('xuống dòng, dấu phẩy, chấm phẩy, tab và khoảng trắng đều là dấu phân tách', () => {
    const expected = ['MSKU1234565', 'CSQU3054383', 'ONEU5001120'];
    expect(nos('MSKU1234565\nCSQU3054383\r\nONEU5001120')).toEqual(expected);
    expect(nos('MSKU1234565, CSQU3054383, ONEU5001120')).toEqual(expected);
    expect(nos('MSKU1234565;CSQU3054383;ONEU5001120')).toEqual(expected);
    expect(nos('MSKU1234565\tCSQU3054383\tONEU5001120')).toEqual(expected);
    expect(nos('MSKU1234565 CSQU3054383 ONEU5001120')).toEqual(expected);
  });

  it('một cột Excel có dòng trống và khoảng trắng thừa', () => {
    expect(nos('\n  MSKU1234565  \n\n   \nCSQU3054383\n')).toEqual(['MSKU1234565', 'CSQU3054383']);
  });

  it('chữ thường và số viết rời nhóm được chuẩn hóa', () => {
    const items = parseContainerList('msku 123456 5\ncsqu-305438-3');
    expect(items.map((i) => i.containerNo)).toEqual(['MSKU1234565', 'CSQU3054383']);
    expect(items.every((i) => i.valid)).toBe(true);
  });

  it('chữ lẫn trong dòng: lấy số container, bỏ phần còn lại', () => {
    expect(nos('Cont 1: MSKU1234565 (20DC)\nCont 2: CSQU3054383 - 40HC')).toEqual([
      'MSKU1234565',
      'CSQU3054383',
    ]);
  });

  it('dòng tiêu đề không có số bị bỏ qua, không thành lỗi', () => {
    const items = parseContainerList('Danh sách container:\nMSKU1234565');
    expect(items).toHaveLength(1);
    expect(items[0]!.line).toBe(1);
  });

  it('sai check digit: đánh dấu không hợp lệ kèm lý do, giữ số đã chuẩn hóa', () => {
    const [item] = parseContainerList('msku1234566');
    expect(item).toMatchObject({ containerNo: 'MSKU1234566', valid: false, duplicateOf: null });
    expect(item!.error).toMatch(/số kiểm tra/i);
  });

  it('dòng có dạng gần giống nhưng sai định dạng thì báo lỗi, không lặng lẽ bỏ qua', () => {
    const items = parseContainerList('MSKU12345655\nMSKU123456\nMSKU1234565');
    expect(items.map((i) => i.valid)).toEqual([false, false, true]);
    expect(items[0]!.error).toMatch(/4 chữ cái/);
    expect(items[0]!.raw).toBe('MSKU12345655');
  });

  it('báo trùng trong danh sách: dòng sau trỏ về dòng đầu tiên', () => {
    const items = parseContainerList('MSKU1234565\nCSQU3054383\nmsku 123456 5\nMSKU1234565');
    expect(items.map((i) => i.duplicateOf)).toEqual([null, null, 1, 1]);
    expect(items[2]!.error).toMatch(/trùng/i);
    expect(items[2]!.valid).toBe(false);
  });

  it('dòng có hai số cách nhau bằng khoảng trắng sinh hai mục', () => {
    expect(nos('MSKU1234565 20DC\nCSQU3054383 40HC')).toEqual(['MSKU1234565', 'CSQU3054383']);
  });

  it('danh sách rỗng hoặc chỉ có khoảng trắng', () => {
    expect(parseContainerList('')).toEqual([]);
    expect(parseContainerList('  \n \t ')).toEqual([]);
  });

  it('đánh số mục tăng dần theo thứ tự xuất hiện', () => {
    const items = parseContainerList('MSKU1234565\nCSQU3054383\nONEU5001120');
    expect(items.map((i) => i.line)).toEqual([1, 2, 3]);
  });
});
