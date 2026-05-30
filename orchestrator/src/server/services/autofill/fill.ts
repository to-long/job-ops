import type { AutofillField } from "@shared/types";
import type { Page } from "playwright";

/**
 * Writes a single field's value into the live page. Returns whether the value
 * was successfully applied. Non-fatal: failures are reported via the return
 * value so one stubborn control never aborts the whole fill.
 */
export async function fillField(
  page: Page,
  field: AutofillField,
): Promise<boolean> {
  if (!field.value) return false;
  const locator = page.locator(`[data-jobops-af="${field.id}"]`).first();

  try {
    if ((await locator.count()) === 0) return false;

    switch (field.type) {
      case "select": {
        // Try matching by visible label, then by value, then by index-free
        // best effort. Playwright throws if nothing matches, so guard it.
        try {
          await locator.selectOption({ label: field.value }, { timeout: 4000 });
        } catch {
          await locator.selectOption(field.value, { timeout: 4000 });
        }
        return true;
      }
      case "checkbox": {
        const truthy = /^(yes|true|1|on|checked)$/i.test(field.value.trim());
        await locator.setChecked(truthy, { timeout: 4000 });
        return true;
      }
      case "radio":
        // Radios are ambiguous to set generically; leave for the user.
        return false;
      case "file":
        // File uploads require a real path; handled separately if at all.
        return false;
      default: {
        await locator.fill(field.value, { timeout: 4000 });
        return true;
      }
    }
  } catch {
    return false;
  }
}

/**
 * Fills every field that has a value, mutating each field's `filled` flag to
 * reflect what actually landed on the page.
 */
export async function fillFields(
  page: Page,
  fields: AutofillField[],
): Promise<void> {
  for (const field of fields) {
    if (!field.value) {
      field.filled = false;
      continue;
    }
    field.filled = await fillField(page, field);
  }
}

/** Captures the current page as a PNG data URL for the review UI. */
export async function captureScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
