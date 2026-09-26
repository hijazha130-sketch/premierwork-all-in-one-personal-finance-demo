import { describe, it, expect } from "vitest";
import {
  isDemo,
  EDITION,
  showDemoNotice,
  ETSY_URL,
  DEMO_BANNER_TEXT,
  DEMO_SETUP_NOTE,
} from "@/lib/edition";

/**
 * Batch 9a — the demo notice + "Get the full app" button are DEMO-EDITION ONLY.
 * The full edition (the default here) must show none of them. The components
 * render the notice/button/note only when `showDemoNotice()` is true, so testing
 * the flag for both editions proves the full edition is untouched.
 */
describe("edition — demo notice gating (Batch 9a)", () => {
  it("tests run as the FULL edition by default (nothing demo-only shows)", () => {
    expect(EDITION).toBe("full");
    expect(isDemo).toBe(false);
    expect(showDemoNotice()).toBe(false);
  });

  it("shows the demo notice ONLY in the demo edition", () => {
    expect(showDemoNotice("demo")).toBe(true);
    expect(showDemoNotice("full")).toBe(false);
  });

  it("every 'Get the full app' opens the Etsy listing", () => {
    expect(ETSY_URL).toBe("https://www.etsy.com/listing/4582519438");
  });

  it("the demo copy is exactly what the buyer sees", () => {
    expect(DEMO_BANNER_TEXT).toBe(
      "This is the free demo. Anything you type here is cleared when you refresh. To keep your own numbers on your phone or computer, get the full app.",
    );
    expect(DEMO_SETUP_NOTE).toBe(
      "Demo: your numbers won't be kept after you refresh. Get the full app to save them.",
    );
  });
});
