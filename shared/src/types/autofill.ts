/**
 * Types for the application auto-fill feature.
 *
 * Auto-fill drives a server-side Playwright browser to a job's application
 * page, intelligently detects the form fields (DOM + a screenshot analysed by
 * the configured vision LLM), and fills them from the user's resume profile.
 *
 * It deliberately stops *before* submitting. The user reviews the filled
 * values (and a screenshot of the live page) in the UI and presses Apply
 * themselves — JobOps never auto-submits an application.
 */

export type AutofillFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "unknown";

export type AutofillFieldConfidence = "high" | "medium" | "low" | "none";

/** A single form control detected on the application page. */
export interface AutofillField {
  /** Stable id derived from the control, used to address it from the UI. */
  id: string;
  /** Best-effort human label for the control. */
  label: string;
  /** Detected control type. */
  type: AutofillFieldType;
  /** The profile attribute this field was mapped to, if any. */
  profileKey: string | null;
  /** Value that was filled (or is staged to fill). */
  value: string;
  /** Whether the value was actually written into the live page. */
  filled: boolean;
  /** How confident the mapper was about this field. */
  confidence: AutofillFieldConfidence;
  /** Whether the control is required on the page. */
  required: boolean;
  /** Available choices for select / radio controls. */
  options?: string[];
  /** Short explanation shown to the user (e.g. why it was left blank). */
  note?: string;
}

export type AutofillSessionStatus = "ready" | "submitted" | "error" | "closed";

/** A live auto-fill session backed by a server-side browser page. */
export interface AutofillSession {
  sessionId: string;
  jobId: string;
  /** The application URL the browser navigated to. */
  url: string;
  fields: AutofillField[];
  /** PNG screenshot of the current page state, as a data URL. */
  screenshot: string;
  status: AutofillSessionStatus;
  /** Human-readable message (errors, submit result, etc.). */
  message?: string;
  createdAt: number;
}

export interface AutofillStartRequest {
  jobId: string;
}

export interface AutofillStartResponse {
  session: AutofillSession;
}

export interface AutofillUpdateRequest {
  fieldId: string;
  value: string;
}

export interface AutofillSessionResponse {
  session: AutofillSession;
}
