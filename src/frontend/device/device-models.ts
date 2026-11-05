import type { DeviceModel } from "../../apps/settings/public.ts";

// Logical pixels describe the rendered front, rather than the physical display's pixel density.
// Both viewport fitting and CSS geometry read this table so switching cannot desynchronize them.
export const deviceModels = {
  "iphone-6s": {
    width: 430,
    height: 886,
    screenWidth: 375,
    screenHeight: 667,
    inset: 27.5,
    bezel: 109.5,
  },
  "iphone-17": {
    width: 426,
    height: 898,
    screenWidth: 402,
    screenHeight: 874,
    inset: 12,
    bezel: 12,
  },
} satisfies Record<
  DeviceModel,
  {
    width: number;
    height: number;
    screenWidth: number;
    screenHeight: number;
    inset: number;
    bezel: number;
  }
>;
