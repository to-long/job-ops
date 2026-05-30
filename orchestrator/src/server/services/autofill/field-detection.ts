import type { AutofillFieldType } from "@shared/types";
import type { Page } from "playwright";

/** A form control as scraped from the live DOM, before profile mapping. */
export interface DetectedField {
  id: string;
  selector: string;
  label: string;
  type: AutofillFieldType;
  required: boolean;
  /** Existing value already present on the page. */
  currentValue: string;
  options?: string[];
}

/**
 * Runs inside the page. Walks visible form controls and returns a structured
 * description of each, including a best-effort label resolved from <label>,
 * aria-label, placeholder, or nearby text. A unique `data-jobops-af` attribute
 * is stamped on every control so we can address it later regardless of how
 * fragile its native selector is.
 */
const COLLECT_FIELDS_SCRIPT = `() => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    return true;
  };

  const labelFor = (el) => {
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl && lbl.textContent) return lbl.textContent.trim();
    }
    const wrapping = el.closest("label");
    if (wrapping && wrapping.textContent) return wrapping.textContent.trim();
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const ref = document.getElementById(labelledby);
      if (ref && ref.textContent) return ref.textContent.trim();
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return placeholder.trim();
    const name = el.getAttribute("name");
    if (name) return name.trim();
    return "";
  };

  const mapType = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (["email", "tel", "url", "number", "radio", "checkbox", "file"].includes(t)) {
      return t;
    }
    if (["text", "search"].includes(t)) return "text";
    if (t === "hidden" || t === "submit" || t === "button" || t === "password") {
      return "skip";
    }
    return "text";
  };

  const controls = Array.from(
    document.querySelectorAll("input, textarea, select"),
  );
  const fields = [];
  let counter = 0;

  for (const el of controls) {
    if (!isVisible(el)) continue;
    const type = mapType(el);
    if (type === "skip") continue;

    const afId = "af-" + counter++;
    el.setAttribute("data-jobops-af", afId);

    const field = {
      id: afId,
      selector: '[data-jobops-af="' + afId + '"]',
      label: labelFor(el).slice(0, 200),
      type,
      required:
        el.hasAttribute("required") ||
        el.getAttribute("aria-required") === "true",
      currentValue: "value" in el ? String(el.value || "") : "",
    };

    if (type === "select") {
      field.options = Array.from(el.querySelectorAll("option"))
        .map((o) => (o.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 50);
    }

    fields.push(field);
  }

  return fields;
}`;

/**
 * Detects fillable controls on the current page. Stamps each control with a
 * stable `data-jobops-af` marker so subsequent fills survive re-renders that
 * would break id/name-based selectors.
 */
export async function detectFields(page: Page): Promise<DetectedField[]> {
  const raw = (await page.evaluate(COLLECT_FIELDS_SCRIPT)) as DetectedField[];
  return Array.isArray(raw) ? raw : [];
}
