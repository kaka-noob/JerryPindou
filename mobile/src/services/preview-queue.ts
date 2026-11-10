// 串行执行预览，只保留最后一个请求；停止后不再回调已离开的页面。
export class PreviewQueue<Input, Output> {
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private pending: { input: Input; version: number } | null = null;
  private stopped = false;
  constructor(private work: (input: Input, cancelled: () => boolean) => Promise<Output>,
    private success: (output: Output, input: Input) => void, private failure: (error: unknown) => void) {}
  request(input: Input, delay = 250) {
    this.stopped = false;
    const version = ++this.version;
    this.pending = null;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.pending = { input, version }; void this.drain(); }, delay);
  }
  stop() { this.stopped = true; this.version++; this.pending = null; clearTimeout(this.timer); }
  private async drain() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.pending && !this.stopped) {
        const job = this.pending;
        this.pending = null;
        const cancelled = () => this.stopped || job.version !== this.version;
        try {
          const output = await this.work(job.input, cancelled);
          if (!cancelled()) this.success(output, job.input);
        } catch (error) { if (!cancelled()) this.failure(error); }
      }
    } finally { this.running = false; }
  }
}
