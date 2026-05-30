import { randomUUID } from "node:crypto";
import { badRequest, notFound, upstreamError } from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { getJobById } from "@server/repositories/jobs";
import type { AutofillField, AutofillSession } from "@shared/types";
import { getProfile } from "../profile";
import { detectFields } from "./field-detection";
import { mapFieldsToProfile } from "./field-mapping";
import { captureScreenshot, fillField, fillFields } from "./fill";
import { buildProfileFillData } from "./profile-fill-data";
import { closeSession, createSession, getSession } from "./session-manager";

/** Review state (fields + screenshot) tracked per live session. */
interface AutofillState {
  fields: AutofillField[];
  screenshot: string;
  status: AutofillSession["status"];
  message?: string;
}

const state = new Map<string, AutofillState>();

function toSession(
  sessionId: string,
  jobId: string,
  url: string,
  s: AutofillState,
): AutofillSession {
  return {
    sessionId,
    jobId,
    url,
    fields: s.fields,
    screenshot: s.screenshot,
    status: s.status,
    message: s.message,
    createdAt: Date.now(),
  };
}

/** Resolves the URL we should drive the browser to for a given job. */
function resolveApplyUrl(applicationLink: string | null, jobUrl: string) {
  const candidate = (applicationLink || jobUrl || "").trim();
  if (!/^https?:\/\//i.test(candidate)) {
    throw badRequest("Job has no valid application URL to auto-fill.");
  }
  return candidate;
}

/**
 * Opens the job's application page in a server-side browser, detects the form,
 * maps it to the user's profile, fills what it can, and returns the staged
 * result for the user to review. Never submits.
 */
export async function startAutofill(jobId: string): Promise<AutofillSession> {
  const job = await getJobById(jobId);
  if (!job) throw notFound("Job not found.");

  const url = resolveApplyUrl(job.applicationLink, job.jobUrl);
  const profile = await getProfile().catch((error) => {
    logger.warn("Autofill could not load profile", {
      jobId,
      error: sanitizeUnknown(error),
    });
    return null;
  });
  if (!profile) {
    throw badRequest(
      "No resume profile is configured. Set up your base resume in Settings first.",
    );
  }
  const profileData = buildProfileFillData(profile);

  const sessionId = randomUUID();
  let session: Awaited<ReturnType<typeof createSession>>;
  try {
    session = await createSession({ sessionId, jobId, url });
  } catch (error) {
    throw upstreamError("Could not open the application page.", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const detected = await detectFields(session.page);
    const preScreenshot = await captureScreenshot(session.page);
    const fields = await mapFieldsToProfile(
      detected,
      profileData,
      preScreenshot,
    );
    await fillFields(session.page, fields);
    const screenshot = await captureScreenshot(session.page);

    const s: AutofillState = {
      fields,
      screenshot,
      status: "ready",
      message:
        detected.length === 0
          ? "No form fields were detected on this page. You may need to open the apply form first."
          : undefined,
    };
    state.set(sessionId, s);
    return toSession(sessionId, jobId, url, s);
  } catch (error) {
    await closeSession(sessionId);
    throw upstreamError("Auto-fill failed while reading the form.", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Applies a user edit to a single field and re-screenshots the page. */
export async function updateAutofillField(
  sessionId: string,
  fieldId: string,
  value: string,
): Promise<AutofillSession> {
  const s = state.get(sessionId);
  const session = getSession(sessionId);
  if (!s || !session) throw notFound("Auto-fill session not found or expired.");

  const field = s.fields.find((f) => f.id === fieldId);
  if (!field) throw badRequest("Unknown field.");

  field.value = value;
  field.filled = await fillField(session.page, field);
  s.screenshot = await captureScreenshot(session.page);
  return toSession(sessionId, session.jobId, session.url, s);
}

/** Re-captures the current screenshot without changing any values. */
export async function refreshAutofill(
  sessionId: string,
): Promise<AutofillSession> {
  const s = state.get(sessionId);
  const session = getSession(sessionId);
  if (!s || !session) throw notFound("Auto-fill session not found or expired.");
  s.screenshot = await captureScreenshot(session.page);
  return toSession(sessionId, session.jobId, session.url, s);
}

/**
 * Clicks the application's submit button on the user's behalf. This is the
 * single moment JobOps interacts with the submit control, and only ever when
 * the user explicitly presses Apply after reviewing.
 */
export async function submitAutofill(
  sessionId: string,
): Promise<AutofillSession> {
  const s = state.get(sessionId);
  const session = getSession(sessionId);
  if (!s || !session) throw notFound("Auto-fill session not found or expired.");

  const { page } = session;
  const candidates = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit application")',
    'button:has-text("Submit Application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Send application")',
  ];

  let clicked = false;
  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        await locator.click({ timeout: 5000 });
        clicked = true;
        break;
      }
    } catch {
      // try the next candidate
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  s.screenshot = await captureScreenshot(page);
  s.status = clicked ? "submitted" : "ready";
  s.message = clicked
    ? "Submit button clicked. Review the page to confirm your application went through."
    : "Couldn't find a submit button automatically — review the screenshot and submit in the page.";
  return toSession(sessionId, session.jobId, session.url, s);
}

/** Tears down a session and its browser. */
export async function closeAutofill(sessionId: string): Promise<void> {
  state.delete(sessionId);
  await closeSession(sessionId);
}
