export interface RestartableApp {
  init(): Promise<void>;
  destroy(): void;
}

interface LanguageAwareAppHostOptions<T extends RestartableApp> {
  createApp: () => T;
  clearContainer: () => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Recreates the class-based dashboard after an in-document locale change.
 * Requests are generation-based so a second language choice made while a
 * remount is running is never lost.
 */
export class LanguageAwareAppHost<T extends RestartableApp> {
  private app: T | null = null;
  private requestedGeneration = 0;
  private appliedGeneration = 0;
  private restartTask: Promise<void> | null = null;

  constructor(private readonly options: LanguageAwareAppHostOptions<T>) {}

  async start(): Promise<void> {
    this.app = this.options.createApp();
    await this.initialize(this.app);
  }

  requestRestart(): void {
    this.requestedGeneration += 1;
    this.ensureRestartTask();
  }

  private ensureRestartTask(): void {
    if (this.restartTask) return;

    this.restartTask = this.restartUntilCurrent().finally(() => {
      this.restartTask = null;
      if (this.appliedGeneration < this.requestedGeneration) this.ensureRestartTask();
    });
  }

  async whenIdle(): Promise<void> {
    while (this.restartTask) await this.restartTask;
  }

  private async restartUntilCurrent(): Promise<void> {
    while (this.appliedGeneration < this.requestedGeneration) {
      const targetGeneration = this.requestedGeneration;
      this.app?.destroy();
      this.options.clearContainer();
      this.app = this.options.createApp();
      await this.initialize(this.app);
      this.appliedGeneration = targetGeneration;
    }
  }

  private async initialize(app: T): Promise<void> {
    try {
      await app.init();
      this.options.onReady?.();
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}
