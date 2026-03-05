import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';

export type SoundOption = 'none' | 'sonar' | 'chime' | 'ping' | 'marimba' | 'droplet' | 'cash';

const SOUND_FILES: Record<Exclude<SoundOption, 'none'>, string> = {
  sonar: 'sonar.mp3',
  chime: 'chime.wav',
  ping: 'ping.wav',
  marimba: 'marimba.wav',
  droplet: 'droplet.wav',
  cash: 'cash.wav',
};

/**
 * Service for playing notification sounds when tasks complete.
 * Uses platform-native audio playback commands.
 */
export class SoundService {
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  /**
   * Play the configured notification sound.
   */
  play(sound: SoundOption): void {
    if (sound === 'none') {
      return;
    }

    const soundFile = path.join(this.extensionPath, 'media', SOUND_FILES[sound]);
    const platform = process.platform;

    let command: string;
    if (platform === 'darwin') {
      // macOS
      command = `afplay "${soundFile}"`;
    } else if (platform === 'linux') {
      // Linux - try different players
      command = `(command -v paplay && paplay "${soundFile}") || (command -v aplay && aplay "${soundFile}") || (command -v mpg123 && mpg123 -q "${soundFile}")`;
    } else if (platform === 'win32') {
      // Windows - use PowerShell
      command = `powershell -c "(New-Object Media.SoundPlayer '${soundFile}').PlaySync()"`;
    } else {
      console.log(`[Swarm Sound] Unsupported platform: ${platform}`);
      return;
    }

    exec(command, (error) => {
      if (error) {
        console.log(`[Swarm Sound] Failed to play sound: ${error.message}`);
      }
    });
  }

  /**
   * Play notification sound based on VS Code configuration.
   */
  playFromConfig(): void {
    const config = vscode.workspace.getConfiguration('swarm');
    const sound = config.get<SoundOption>('notificationSound', 'sonar');
    this.play(sound);
  }
}
