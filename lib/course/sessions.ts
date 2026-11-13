import type { Engine, Shell, ShellOptions } from "./types";

const shells = new Map<string, Shell>();

/** Mỗi terminal (lab/sự cố) giữ một shell riêng, tồn tại đến khi "Đặt lại". */
export function getShell(engine: Engine, key: string, opts: ShellOptions): Shell {
  let sh = shells.get(key);
  if (!sh) {
    sh = engine.createShell(opts);
    shells.set(key, sh);
  }
  return sh;
}

export function dropShell(key: string) {
  shells.delete(key);
}
