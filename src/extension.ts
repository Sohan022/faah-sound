import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_ERROR_PATTERNS,
  DEFAULT_IGNORE_EXIT_CODES,
  normalizeDebounceMs,
  normalizeIgnoreExitCodes,
  parseErrorPatterns
} from "./core/configParser";
import { DebounceGate } from "./core/debounce";
import { RollingPatternMatcher } from "./core/patternMatcher";
import { SoundPlayer } from "./soundPlayer";

const CONFIG_NAMESPACE = "faaahSound";
const SUPPORTED_SOUND_EXTENSIONS = new Set([".wav", ".mp3"]);
const BUNDLED_SOUND_RELATIVE_PATH = path.join("media", "faaah.mp3");

interface RuntimeConfig {
  enabled: boolean;
  customSoundPath: string;
  outputScanningEnabled: boolean;
  debounceMs: number;
  compiledPatterns: RegExp[];
  invalidPatterns: string[];
  ignoreExitCodeSet: Set<number>;
}

interface TerminalDataEventLike {
  terminal: vscode.Terminal;
  data: string;
}

class Logger {
  private readonly channel: vscode.OutputChannel;

  public constructor(channel: vscode.OutputChannel) {
    this.channel = channel;
  }

  public info(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  public warn(message: string): void {
    this.channel.appendLine(`[WARN] ${message}`);
  }

  public error(message: string, error?: unknown): void {
    const suffix = error instanceof Error ? ` ${error.message}` : "";
    this.channel.appendLine(`[ERROR] ${message}${suffix}`);
  }

  public dispose(): void {
    this.channel.dispose();
  }
}

class FaaahController implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly logger: Logger;
  private readonly soundPlayer = new SoundPlayer();
  private readonly matcher = new RollingPatternMatcher();
  private readonly disposables: vscode.Disposable[] = [];
  private config: RuntimeConfig;
  private debounceGate = new DebounceGate(DEFAULT_DEBOUNCE_MS);
  private resolvedSoundPath = "";
  private soundPathReady = false;
  private lastPlaybackError = "";

  public constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.context = context;
    this.logger = logger;
    this.config = {
      enabled: true,
      customSoundPath: "",
      outputScanningEnabled: true,
      debounceMs: DEFAULT_DEBOUNCE_MS,
      compiledPatterns: [],
      invalidPatterns: [],
      ignoreExitCodeSet: new Set(DEFAULT_IGNORE_EXIT_CODES)
    };
  }

  public async initialize(): Promise<void> {
    await this.reloadConfiguration(true);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(CONFIG_NAMESPACE)) {
          return;
        }

        void this.reloadConfiguration(false);
      })
    );

    const terminalApi = vscode.window as typeof vscode.window & {
      onDidWriteTerminalData?: (
        listener: (event: TerminalDataEventLike) => unknown
      ) => vscode.Disposable;
      onDidEndTerminalShellExecution?: (
        listener: (event: vscode.TerminalShellExecutionEndEvent) => unknown
      ) => vscode.Disposable;
    };

    try {
      const api = terminalApi as unknown as {
        onDidWriteTerminalData?: (
          listener: (event: TerminalDataEventLike) => unknown
        ) => vscode.Disposable;
      };

      if (typeof api.onDidWriteTerminalData === "function") {
        this.disposables.push(
          api.onDidWriteTerminalData((event) => {
            this.onTerminalData(event);
          })
        );
      } else {
        this.logger.warn("Terminal output scanning API is unavailable in this VS Code version.");
      }
    } catch {
      this.logger.warn(
        "Terminal output scanning is disabled because VS Code proposed API 'terminalDataWriteEvent' is not enabled."
      );
    }

    if (typeof terminalApi.onDidEndTerminalShellExecution === "function") {
      this.disposables.push(
        terminalApi.onDidEndTerminalShellExecution((event) => {
          this.onTerminalExecutionEnd(event);
        })
      );
    } else {
      this.logger.warn(
        "Terminal shell execution events are unavailable. Exit-code based alerts are disabled."
      );
    }

    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        this.matcher.clear(terminal);
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand("faaahSound.toggle", async () => {
        await this.toggleEnabled();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand("faaahSound.playTestSound", async () => {
        await this.playTestSound();
      })
    );

    this.logger.info("Faaah Sound extension initialized.");
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private onTerminalData(event: TerminalDataEventLike): void {
    if (!this.config.enabled || !this.config.outputScanningEnabled) {
      return;
    }

    if (this.config.compiledPatterns.length === 0) {
      return;
    }

    const matched = this.matcher.matches(event.terminal, event.data, this.config.compiledPatterns);
    if (!matched) {
      return;
    }

    this.matcher.clear(event.terminal);
    this.triggerSound("Detected matching terminal output pattern.");
  }

  private onTerminalExecutionEnd(event: vscode.TerminalShellExecutionEndEvent): void {
    if (!this.config.enabled) {
      return;
    }

    const exitCode = event.exitCode;
    if (typeof exitCode !== "number") {
      return;
    }

    if (exitCode === 0 || this.config.ignoreExitCodeSet.has(exitCode)) {
      return;
    }

    this.triggerSound(`Detected non-zero terminal exit code: ${exitCode}.`);
  }

  private triggerSound(reason: string): void {
    if (!this.soundPathReady) {
      return;
    }

    if (!this.debounceGate.canTrigger()) {
      this.logger.info(`Sound suppressed due to debounce window. Reason: ${reason}`);
      return;
    }

    this.logger.info(reason);
    void this.playSound();
  }

  private async playSound(): Promise<void> {
    try {
      await this.soundPlayer.play(this.resolvedSoundPath);
      this.lastPlaybackError = "";
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      if (failure !== this.lastPlaybackError) {
        this.lastPlaybackError = failure;
        void vscode.window.showErrorMessage(
          `Faaah Sound failed to play audio. ${failure}`
        );
      }
      this.logger.error("Failed to play sound.", error);
    }
  }

  private async playTestSound(): Promise<void> {
    if (!this.soundPathReady) {
      void vscode.window.showWarningMessage(
        `Faaah Sound cannot play because the configured sound file is invalid: ${this.resolvedSoundPath}`
      );
      return;
    }

    this.logger.info("Playing test sound.");
    await this.playSound();
  }

  private async toggleEnabled(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const current = configuration.get<boolean>("enabled", true);
    const next = !current;

    await configuration.update("enabled", next, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
      `Faaah Sound is now ${next ? "enabled" : "disabled"}.`
    );
  }

  private async reloadConfiguration(initialLoad: boolean): Promise<void> {
    const configuration = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    this.config = this.readRuntimeConfig(configuration);
    this.debounceGate.updateDebounceMs(this.config.debounceMs);
    this.resolvedSoundPath = resolveSoundPath(this.config.customSoundPath, this.context);

    const validationError = await validateSoundPath(this.resolvedSoundPath);
    if (validationError === undefined) {
      this.soundPathReady = true;
    } else if (this.config.customSoundPath.trim().length > 0) {
      const fallbackPath = resolveBundledSoundPath(this.context);
      const fallbackError = await validateSoundPath(fallbackPath);
      if (fallbackError === undefined) {
        this.resolvedSoundPath = fallbackPath;
        this.soundPathReady = true;
        const message =
          `Custom sound is invalid (${validationError}). Falling back to bundled faaah sound.`;
        this.logger.warn(message);
        void vscode.window.showWarningMessage(`Faaah Sound: ${message}`);
      } else {
        this.soundPathReady = false;
        const message =
          `Custom sound is invalid (${validationError}) and bundled fallback is also invalid (${fallbackError}).`;
        this.logger.warn(message);
        void vscode.window.showWarningMessage(`Faaah Sound: ${message}`);
      }
    } else {
      this.soundPathReady = false;
      const message = `Configured sound file is invalid: ${validationError}`;
      this.logger.warn(message);
      if (initialLoad) {
        void vscode.window.showWarningMessage(`Faaah Sound: ${message}`);
      }
    }

    if (this.config.invalidPatterns.length > 0) {
      const invalid = this.config.invalidPatterns.join(", ");
      const message = `Ignored invalid regex pattern(s): ${invalid}`;
      this.logger.warn(message);
      void vscode.window.showWarningMessage(`Faaah Sound: ${message}`);
    }
  }

  private readRuntimeConfig(configuration: vscode.WorkspaceConfiguration): RuntimeConfig {
    const enabled = configuration.get<boolean>("enabled", true);
    const customSoundPath = (configuration.get<string>("customSoundPath", "") ?? "").trim();
    const outputScanningEnabled = configuration.get<boolean>("outputScanningEnabled", true);
    const debounceMs = normalizeDebounceMs(
      configuration.get<number>("debounceMs", DEFAULT_DEBOUNCE_MS)
    );

    const patternResult = parseErrorPatterns(
      configuration.get<string[]>("errorPatterns", DEFAULT_ERROR_PATTERNS)
    );
    const ignoreExitCodes = normalizeIgnoreExitCodes(
      configuration.get<number[]>("ignoreExitCodes", DEFAULT_IGNORE_EXIT_CODES)
    );

    return {
      enabled,
      customSoundPath,
      outputScanningEnabled,
      debounceMs,
      compiledPatterns: patternResult.compiled,
      invalidPatterns: patternResult.invalid,
      ignoreExitCodeSet: new Set(ignoreExitCodes)
    };
  }
}

function resolveSoundPath(customSoundPath: string, context: vscode.ExtensionContext): string {
  const trimmed = customSoundPath.trim();
  if (trimmed.length === 0) {
    return resolveBundledSoundPath(context);
  }

  const expandedHome = expandHomeDirectory(trimmed);
  if (path.isAbsolute(expandedHome)) {
    return path.normalize(expandedHome);
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder !== undefined) {
    return path.resolve(workspaceFolder, expandedHome);
  }

  return path.resolve(expandedHome);
}

function resolveBundledSoundPath(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(BUNDLED_SOUND_RELATIVE_PATH);
}

function expandHomeDirectory(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

async function validateSoundPath(soundPath: string): Promise<string | undefined> {
  const extension = path.extname(soundPath).toLowerCase();
  if (!SUPPORTED_SOUND_EXTENSIONS.has(extension)) {
    return `Unsupported file type "${extension || "<none>"}". Only .wav and .mp3 are supported.`;
  }

  try {
    await fs.access(soundPath, fsConstants.R_OK);
  } catch {
    return `Cannot read sound file at "${soundPath}".`;
  }

  return undefined;
}

let controller: FaaahController | undefined;
let logger: Logger | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger(vscode.window.createOutputChannel("Faaah Sound"));
  controller = new FaaahController(context, logger);
  context.subscriptions.push(controller);
  context.subscriptions.push({
    dispose: () => {
      logger?.dispose();
      logger = undefined;
    }
  });

  await controller.initialize();
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
