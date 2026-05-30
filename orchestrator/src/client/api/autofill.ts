import type { AutofillSession } from "@shared/types";
import { fetchApi } from "./core";

/** Opens an application page server-side and stages auto-filled values. */
export async function startAutofill(jobId: string): Promise<AutofillSession> {
  const { session } = await fetchApi<{ session: AutofillSession }>(
    "/autofill/start",
    {
      method: "POST",
      body: JSON.stringify({ jobId }),
    },
  );
  return session;
}

/** Applies a user edit to a single staged field. */
export async function updateAutofillField(
  sessionId: string,
  fieldId: string,
  value: string,
): Promise<AutofillSession> {
  const { session } = await fetchApi<{ session: AutofillSession }>(
    `/autofill/${encodeURIComponent(sessionId)}/update`,
    {
      method: "POST",
      body: JSON.stringify({ fieldId, value }),
    },
  );
  return session;
}

/** Re-scans the live page for fields and re-fills (e.g. after a new step). */
export async function rescanAutofill(
  sessionId: string,
): Promise<AutofillSession> {
  const { session } = await fetchApi<{ session: AutofillSession }>(
    `/autofill/${encodeURIComponent(sessionId)}/rescan`,
    { method: "POST" },
  );
  return session;
}

/** Re-captures the live page screenshot. */
export async function refreshAutofill(
  sessionId: string,
): Promise<AutofillSession> {
  const { session } = await fetchApi<{ session: AutofillSession }>(
    `/autofill/${encodeURIComponent(sessionId)}/screenshot`,
    { method: "POST" },
  );
  return session;
}

/** Clicks the application's submit button (user-initiated). */
export async function submitAutofill(
  sessionId: string,
): Promise<AutofillSession> {
  const { session } = await fetchApi<{ session: AutofillSession }>(
    `/autofill/${encodeURIComponent(sessionId)}/submit`,
    { method: "POST" },
  );
  return session;
}

/** Closes the session and its server-side browser. */
export async function closeAutofill(sessionId: string): Promise<void> {
  await fetchApi<{ closed: boolean }>(
    `/autofill/${encodeURIComponent(sessionId)}/close`,
    { method: "POST" },
  );
}
