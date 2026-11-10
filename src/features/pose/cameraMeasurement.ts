// 100 ms slots are credited only when fully covered by consecutive face results.
// Missing results for >1 second break continuity; they are never backfilled.
export const CAMERA_SLOT_MS = 100;
export const CAMERA_MAX_FRAME_GAP_MS = 1000;
export interface CameraMeasurementBatch {
  slots: number[];
  blinks: Record<string, number>;
}

export class CameraMeasurement {
  private previous: number | null = null;
  private started: number | null = null;
  private nextSlot = 0;
  private slots = new Set<number>();
  private blinks: Record<string, number> = {};

  frame(now: number, valid: boolean): boolean {
    if (!valid) {
      this.pause();
      return false;
    }
    const continuous = this.previous !== null && now >= this.previous &&
      now - this.previous <= CAMERA_MAX_FRAME_GAP_MS;
    if (!continuous) {
      this.pause();
      this.started = now;
      this.nextSlot = Math.ceil(now / CAMERA_SLOT_MS);
    }
    this.previous = now;
    const endSlot = Math.floor(now / CAMERA_SLOT_MS);
    while (this.nextSlot < endSlot) this.slots.add(this.nextSlot++);
    return continuous;
  }

  blink(now: number): void {
    if (this.previous !== now || this.started === null) return;
    const slot = Math.floor(now / CAMERA_SLOT_MS);
    // The initial partial slot is not counted as measurement time.
    if (slot * CAMERA_SLOT_MS < this.started) return;
    this.blinks[slot] = (this.blinks[slot] ?? 0) + 1;
  }

  pause(): void {
    // Discard blinks from the unfinished slot, while preserving completed slots.
    for (const key of Object.keys(this.blinks)) {
      if (!this.slots.has(Number(key))) delete this.blinks[key];
    }
    this.previous = null;
    this.started = null;
  }

  take(): CameraMeasurementBatch {
    const slots = [...this.slots].sort((a, b) => a - b);
    const blinks: Record<string, number> = {};
    for (const slot of slots) {
      if (this.blinks[slot]) blinks[slot] = this.blinks[slot];
      delete this.blinks[slot];
    }
    this.slots.clear();
    return { slots, blinks };
  }
}

// One 600-bit mask per UTC minute: at most 1440 small entries per UTC day.
export function mergeCameraSlots(
  existing: Record<string, string>,
  batch: CameraMeasurementBatch,
) {
  const masks = { ...existing };
  let addedSlots = 0;
  let addedBlinks = 0;
  for (const slot of new Set(batch.slots)) {
    const minute = String(Math.floor(slot / 600));
    const bit = 1n << BigInt(slot % 600);
    const mask = BigInt(`0x${masks[minute] || '0'}`);
    if ((mask & bit) !== 0n) continue;
    masks[minute] = (mask | bit).toString(16);
    addedSlots++;
    addedBlinks += batch.blinks[slot] ?? 0;
  }
  return { masks, addedSeconds: addedSlots / 10, addedBlinks };
}
