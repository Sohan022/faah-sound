# Faaah Terminal Error Sound

Play an audible "faaah" alert whenever a command fails in the VS Code integrated terminal.

## Features

- Instant sound feedback for non-zero terminal exits
- Real-time terminal output pattern matching (regex-based)
- Bundled default `faaah.mp3` sound
- Custom sound support (`.wav` and `.mp3`)
- Command Palette toggle
- Ignore specific exit codes (default: `130` for Ctrl+C)
- Debounce protection to prevent sound spam
- Cross-platform behavior (Windows, macOS, Linux)

## Requirements

- VS Code `1.95.0` or newer
- For Linux sound playback, at least one supported player should be installed (`ffplay`, `mpg123`, `mpg321`, `mpv`, `mplayer`, `cvlc`, `paplay`, or `aplay`)

## Extension Settings

This extension contributes the following settings under `faaahSound`:

- `enabled` (`boolean`, default `true`): Global on/off switch
- `customSoundPath` (`string`, default `""`): Absolute or workspace-relative path to a custom `.wav` or `.mp3`
- `errorPatterns` (`string[]`): Case-insensitive regex patterns used for live output scanning
- `outputScanningEnabled` (`boolean`, default `true`): Enable/disable output pattern detection
- `ignoreExitCodes` (`number[]`, default `[130]`): Non-zero codes that should not trigger sound
- `debounceMs` (`number`, default `1200`): Minimum milliseconds between sound triggers

## Commands

- `Faaah Sound: Toggle Error Sound` (`faaahSound.toggle`)
- `Faaah Sound: Play Test Sound` (`faaahSound.playTestSound`)

## Behavior Notes

- Exit-code alerts use terminal shell execution events. In shells without integration data, pattern scanning still works.
- Pattern matches are case-insensitive regex checks over a rolling terminal output buffer.
- ANSI color sequences are stripped before pattern matching to reduce false negatives.
- Invalid custom sound paths automatically fall back to the bundled `faaah.wav`.

## Development

```bash
npm install
npm run compile
npm test
```

Run extension in debug:

1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run terminal commands in the integrated terminal and force a failure.


## License

MIT
