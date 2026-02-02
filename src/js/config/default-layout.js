/*
 * default-layout.js - Default window layout for first-time users
 *
 * Defines which windows are visible and their position/size when the app
 * starts with no saved state. Windows not listed stay hidden at their
 * constructor defaults.
 *
 * Special values:
 *   "viewport-fill" — fills available viewport with margin (screen-window)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export const DEFAULT_LAYOUT = [
  {
    id: "screen-window",
    x: 20,
    y: 70,
    width: 587,
    height: 475,
    visible: true,
    viewportLocked: false,
  },
  {
    id: "disk-drives",
    x: 624,
    y: 156,
    width: 300,
    height: 475,
    visible: true,
    viewportLocked: false,
  },
];
