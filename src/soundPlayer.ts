import { spawn, spawnSync } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

interface LinuxPlayer {
  command: string;
  args: (soundPath: string) => string[];
}

const LINUX_WAV_PLAYERS: readonly LinuxPlayer[] = [
  { command: "paplay", args: (soundPath) => [soundPath] },
  { command: "aplay", args: (soundPath) => [soundPath] },
  {
    command: "ffplay",
    args: (soundPath) => ["-nodisp", "-autoexit", "-loglevel", "quiet", soundPath]
  },
  { command: "play", args: (soundPath) => [soundPath] },
  { command: "mpv", args: (soundPath) => ["--no-video", "--really-quiet", soundPath] },
  { command: "mplayer", args: (soundPath) => [soundPath] },
  {
    command: "cvlc",
    args: (soundPath) => ["--intf", "dummy", "--play-and-exit", soundPath]
  }
];

const LINUX_MP3_PLAYERS: readonly LinuxPlayer[] = [
  {
    command: "ffplay",
    args: (soundPath) => ["-nodisp", "-autoexit", "-loglevel", "quiet", soundPath]
  },
  { command: "mpg123", args: (soundPath) => [soundPath] },
  { command: "mpg321", args: (soundPath) => [soundPath] },
  { command: "play", args: (soundPath) => [soundPath] },
  { command: "mpv", args: (soundPath) => ["--no-video", "--really-quiet", soundPath] },
  { command: "mplayer", args: (soundPath) => [soundPath] },
  {
    command: "cvlc",
    args: (soundPath) => ["--intf", "dummy", "--play-and-exit", soundPath]
  }
];

export class SoundPlayer {
  private readonly linuxPlayerCache = new Map<string, LinuxPlayer | null>();

  public async play(soundPath: string): Promise<void> {
    const extension = path.extname(soundPath).toLowerCase();
    if (extension !== ".wav" && extension !== ".mp3") {
      throw new Error(`Unsupported sound format: ${extension || "<none>"}`);
    }

    if (process.platform === "darwin") {
      await this.runProcess("afplay", [soundPath]);
      return;
    }

    if (process.platform === "linux") {
      await this.playOnLinux(soundPath, extension);
      return;
    }

    if (process.platform === "win32") {
      await this.playOnWindows(soundPath, extension);
      return;
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  private async playOnLinux(soundPath: string, extension: string): Promise<void> {
    const player = this.resolveLinuxPlayer(extension);
    if (player === null) {
      throw new Error(
        `No supported Linux audio player found for ${extension}. Install ffplay, mpg123, mpv, or another supported player.`
      );
    }

    await this.runProcess(player.command, player.args(soundPath));
  }

  private resolveLinuxPlayer(extension: string): LinuxPlayer | null {
    if (this.linuxPlayerCache.has(extension)) {
      return this.linuxPlayerCache.get(extension) ?? null;
    }

    const candidates = extension === ".wav" ? LINUX_WAV_PLAYERS : LINUX_MP3_PLAYERS;
    for (const candidate of candidates) {
      if (isCommandAvailable(candidate.command)) {
        this.linuxPlayerCache.set(extension, candidate);
        return candidate;
      }
    }

    this.linuxPlayerCache.set(extension, null);
    return null;
  }

  private async playOnWindows(soundPath: string, extension: string): Promise<void> {
    if (extension === ".wav") {
      const wavScript = [
        "$player = New-Object System.Media.SoundPlayer",
        `$player.SoundLocation = ${asPowerShellLiteral(soundPath)}`,
        "$player.Load()",
        "$player.PlaySync()"
      ].join("; ");

      await this.runProcess("powershell", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        wavScript
      ]);
      return;
    }

    const mediaPlayerScript = [
      "Add-Type -AssemblyName presentationCore",
      `$uri = [System.Uri]::new(${asPowerShellLiteral(pathToFileURL(soundPath).toString())})`,
      "$player = New-Object System.Windows.Media.MediaPlayer",
      "$done = $false",
      "$player.MediaEnded += { $script:done = $true }",
      "$player.MediaFailed += { $script:done = $true }",
      "$player.Open($uri)",
      "$player.Play()",
      "$timeout = [DateTime]::UtcNow.AddSeconds(20)",
      "while (-not $script:done -and [DateTime]::UtcNow -lt $timeout) { Start-Sleep -Milliseconds 100 }",
      "$player.Close()"
    ].join("; ");

    await this.runProcess("powershell", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      mediaPlayerScript
    ]);
  }

  private runProcess(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: "ignore",
        windowsHide: true
      });

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Command "${command}" exited with code ${String(code)}.`));
      });
    });
  }
}

function isCommandAvailable(command: string): boolean {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookupCommand, [command], {
    stdio: "ignore",
    windowsHide: true
  });
  return result.status === 0;
}

function asPowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
