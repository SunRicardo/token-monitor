'use strict';

const path = require('node:path');
const { Tray, Menu, nativeImage, screen } = require('electron');

const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');

function buildTrayIcon() {
  // macOS menu bar items render at 16–22pt; 18px is a good middle ground.
  // Resize handles HiDPI itself; 20px matches typical menubar item size.
  return nativeImage.createFromPath(ICON_PATH).resize({ width: 20, height: 20 });
}

function formatCompactNumber(value) {
  const n = Math.round(Number(value) || 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(value) {
  const amount = Number(value) || 0;
  return `$${amount.toFixed(amount >= 10 ? 2 : 4)}`;
}

function pickWorstLimit(stats) {
  const providers = stats?.limits?.providers || [];
  let worst = null;
  for (const provider of providers) {
    if (provider.status !== 'ok' || provider.stale) continue;
    for (const window of provider.windows || []) {
      const remaining = Number(window.remainingPercent);
      if (!Number.isFinite(remaining)) continue;
      if (!worst || remaining < worst.remaining) {
        worst = { remaining, provider: provider.provider };
      }
    }
  }
  return worst;
}

function formatTrayText(stats, contentMode = 'tokens') {
  if (contentMode === 'icon') return '';
  if (contentMode === 'bars' || contentMode === 'barsSession' || contentMode === 'barsAllSessions') {
    // Icon carries all the info; only show text if we have no limit data at all.
    if (pickWorstLimit(stats)) return '';
  }
  const today = stats?.periods?.today || {};
  const allTime = stats?.periods?.allTime || {};
  if (contentMode === 'cost') return formatCost(today.costUsd);
  if (contentMode === 'costAll') return formatCost(allTime.costUsd);
  if (contentMode === 'tokensAll') return formatCompactNumber(allTime.totalTokens);
  if (contentMode === 'bothAll') return `${formatCompactNumber(allTime.totalTokens)} · ${formatCost(allTime.costUsd)}`;
  if (contentMode === 'both') return `${formatCompactNumber(today.totalTokens)} · ${formatCost(today.costUsd)}`;
  return formatCompactNumber(today.totalTokens);
}

function createTray({ onToggle, onQuit, onSwitchToWindowMode }) {
  const tray = new Tray(buildTrayIcon());
  tray.setToolTip('Token Monitor');

  tray.on('click', () => onToggle(tray));
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show / Hide', click: () => onToggle(tray) },
      { type: 'separator' },
      { label: 'Switch to Window Mode', click: () => onSwitchToWindowMode() },
      { type: 'separator' },
      { label: 'Quit Token Monitor', click: () => onQuit() }
    ]);
    tray.popUpContextMenu(menu);
  });

  return tray;
}

function popoverBounds(tray, popoverWidth, popoverHeight) {
  const trayBounds = tray?.getBounds?.() || { x: 0, y: 0, width: 0, height: 0 };
  const cursor = screen.getCursorScreenPoint();
  const anchor = trayBounds.width > 0
    ? { x: trayBounds.x + trayBounds.width / 2, y: trayBounds.y, height: trayBounds.height }
    : { x: cursor.x, y: cursor.y, height: 0 };
  const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const wa = display.workArea;

  let x = Math.round(anchor.x - popoverWidth / 2);
  x = Math.max(wa.x + 4, Math.min(x, wa.x + wa.width - popoverWidth - 4));

  let y;
  if (process.platform === 'darwin') {
    y = Math.round(anchor.y + (anchor.height || 0) + 4);
  } else {
    // Windows / Linux: tray icon usually sits near the bottom; open above.
    y = Math.round(anchor.y - popoverHeight - 8);
    if (y < wa.y + 4) y = Math.round(anchor.y + (anchor.height || 0) + 8);
  }
  y = Math.max(wa.y + 4, Math.min(y, wa.y + wa.height - popoverHeight - 4));

  return { x, y, width: popoverWidth, height: popoverHeight };
}

module.exports = { createTray, formatTrayText, popoverBounds, pickWorstLimit, buildTrayIcon };
