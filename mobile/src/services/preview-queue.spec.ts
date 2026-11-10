import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewQueue } from './preview-queue';

afterEach(() => vi.useRealTimers());
describe('实时预览调度', () => {
  it('连续调整只计算最后一组参数', async () => {
    vi.useFakeTimers();
    const work = vi.fn(async (value: number) => value * 2);
    const success = vi.fn();
    const queue = new PreviewQueue(work, success, vi.fn());
    queue.request(1); queue.request(2); queue.request(3);
    await vi.advanceTimersByTimeAsync(250);
    expect(work).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith(6, 3);
  });
  it('旧任务运行期间的新请求会取消旧结果，且任务不并发', async () => {
    vi.useFakeTimers();
    let finish!: (value: number) => void;
    let isCancelled!: () => boolean;
    const success = vi.fn();
    const work = vi.fn((value: number, cancelled: () => boolean) => {
      if (value === 1) { isCancelled = cancelled; return new Promise<number>(resolve => { finish = resolve; }); }
      return Promise.resolve(value);
    });
    const queue = new PreviewQueue(work, success, vi.fn());
    queue.request(1, 0); await vi.advanceTimersByTimeAsync(0);
    queue.request(2, 0); await vi.advanceTimersByTimeAsync(0);
    expect(isCancelled()).toBe(true); expect(work).toHaveBeenCalledTimes(1);
    finish(1); await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledTimes(1); expect(success).toHaveBeenCalledWith(2, 2);
  });
  it('离开页面后不提交结果或错误，重新进入仍可生成', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const success = vi.fn(); const failure = vi.fn();
    const queue = new PreviewQueue((value: number) => value === 1 ? new Promise<number>((_, fail) => { reject = fail; }) : Promise.resolve(value), success, failure);
    queue.request(1, 0); await vi.advanceTimersByTimeAsync(0); queue.stop();
    reject(new Error('旧任务失败')); await vi.advanceTimersByTimeAsync(0);
    expect(failure).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    queue.request(2, 0); await vi.advanceTimersByTimeAsync(0);
    expect(success).toHaveBeenCalledWith(2, 2);
  });
  it('失败可重试，并报告当前任务错误', async () => {
    vi.useFakeTimers();
    const failure = vi.fn(); const success = vi.fn();
    const queue = new PreviewQueue(vi.fn().mockRejectedValueOnce(new Error('解码失败')).mockResolvedValueOnce(8), success, failure);
    queue.request(1, 0); await vi.advanceTimersByTimeAsync(0);
    expect(failure).toHaveBeenCalledTimes(1);
    queue.request(1, 0); await vi.advanceTimersByTimeAsync(0);
    expect(success).toHaveBeenCalledWith(8, 1);
  });
});
