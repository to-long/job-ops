import { logger } from "@infra/logger";
import type { Browser, BrowserContext, Page } from "playwright";

/** Live browser resources backing a single auto-fill session. */
export interface AutofillBrowserSession {
  sessionId: string;
  jobId: string;
  url: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastUsedAt: number;
}

/** Sessions idle for longer than this are evicted and their browsers closed. */
const SESSION_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;
/** Hard cap on concurrent browser sessions to bound memory. */
const MAX_SESSIONS = 5;

const sessions = new Map<string, AutofillBrowserSession>();
let sweepTimer: NodeJS.Timeout | null = null;

function ensureSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (now - session.lastUsedAt > SESSION_TTL_MS) {
        void closeSession(session.sessionId);
      }
    }
    if (sessions.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive solely for the sweeper.
  sweepTimer.unref?.();
}

/**
 * Launches a fresh anti-detection browser and navigates to the application
 * URL. Headless because the page is only ever surfaced to the user as
 * screenshots in the JobOps UI.
 */
export async function createSession(args: {
  sessionId: string;
  jobId: string;
  url: string;
}): Promise<AutofillBrowserSession> {
  if (sessions.size >= MAX_SESSIONS) {
    // Evict the least recently used session to make room.
    let oldest: AutofillBrowserSession | null = null;
    for (const session of sessions.values()) {
      if (!oldest || session.lastUsedAt < oldest.lastUsedAt) oldest = session;
    }
    if (oldest) await closeSession(oldest.sessionId);
  }

  // Dynamic import: playwright (pulled in by browser-utils) is heavy, so we
  // only load it when an auto-fill session is actually started.
  const [{ createLaunchOptions }, { firefox }] = await Promise.all([
    import("browser-utils"),
    import("playwright"),
  ]);
  const { launchOptions } = await createLaunchOptions({ headless: true });
  const browser = await firefox.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(args.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    // Give SPA application forms a moment to hydrate.
    await page
      .waitForLoadState("networkidle", { timeout: 8000 })
      .catch(() => {});
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }

  const now = Date.now();
  const session: AutofillBrowserSession = {
    sessionId: args.sessionId,
    jobId: args.jobId,
    url: args.url,
    browser,
    context,
    page,
    createdAt: now,
    lastUsedAt: now,
  };
  sessions.set(args.sessionId, session);
  ensureSweeper();
  return session;
}

export function getSession(sessionId: string): AutofillBrowserSession | null {
  const session = sessions.get(sessionId);
  if (session) session.lastUsedAt = Date.now();
  return session ?? null;
}

export async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  try {
    await session.browser.close();
  } catch (error) {
    logger.warn("Failed to close autofill browser", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Test-only: number of live sessions. */
export function __getSessionCountForTests(): number {
  return sessions.size;
}
