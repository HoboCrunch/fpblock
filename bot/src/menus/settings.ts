// bot/src/menus/settings.ts — Mute/unmute state + settings menu

import { InlineKeyboard } from "grammy";

export class MuteState {
  private mutedUntil: number | null = null;

  isMuted(): boolean {
    if (this.mutedUntil === null) return false;
    if (Date.now() >= this.mutedUntil) {
      this.mutedUntil = null;
      return false;
    }
    return true;
  }

  muteFor(minutes: number): void {
    this.mutedUntil = Date.now() + minutes * 60 * 1000;
  }

  unmute(): void {
    this.mutedUntil = null;
  }

  remainingMinutes(): number {
    if (!this.mutedUntil) return 0;
    return Math.max(0, Math.ceil((this.mutedUntil - Date.now()) / 60_000));
  }
}

// Singleton — shared across menus and notification routing
export const muteState = new MuteState();

export function settingsText(): string {
  const status = muteState.isMuted()
    ? `🔇 Muted (${muteState.remainingMinutes()}m remaining)`
    : "🔊 Active";

  return `⚙️ <b>Settings</b>\n\nNotifications: ${status}`;
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔇 Mute 1h", "settings:mute:60")
    .text("🔇 Mute 4h", "settings:mute:240")
    .row()
    .text("🔊 Unmute", "settings:unmute")
    .text("← Back", "menu:main");
}
