// Nhận diện lỗi khóa của MariaDB/InnoDB để nghiệp vụ trả mã lỗi thân thiện thay vì INTERNAL_ERROR.
const ER_LOCK_WAIT_TIMEOUT = 1205;
const ER_LOCK_DEADLOCK = 1213;

type DbErrorLike = { errno?: number; code?: string; cause?: unknown };

function walk(error: unknown, visit: (e: DbErrorLike) => boolean): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if (visit(current as DbErrorLike)) return true;
    current = (current as DbErrorLike).cause; // drizzle bọc lỗi driver trong `cause`
  }
  return false;
}

/** Hết thời gian chờ khóa dòng (innodb_lock_wait_timeout) hoặc bị chọn làm nạn nhân deadlock: thử lại được. */
export function isLockContentionError(error: unknown): boolean {
  return walk(
    error,
    (e) =>
      e.errno === ER_LOCK_WAIT_TIMEOUT ||
      e.errno === ER_LOCK_DEADLOCK ||
      e.code === 'ER_LOCK_WAIT_TIMEOUT' ||
      e.code === 'ER_LOCK_DEADLOCK',
  );
}
