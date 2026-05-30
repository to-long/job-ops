import * as api from "@client/api";
import type { AutofillField, AutofillSession } from "@shared/types.js";
import {
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AutoFillDialogProps {
  jobId: string;
  disabled?: boolean;
  className?: string;
}

const confidenceTone: Record<AutofillField["confidence"], string> = {
  high: "border-emerald-500/40 text-emerald-300",
  medium: "border-amber-500/40 text-amber-300",
  low: "border-rose-500/40 text-rose-300",
  none: "border-border/50 text-muted-foreground",
};

/**
 * Drives the server-side auto-fill flow: opens the application page in a
 * headless browser, fills it from the user's profile, and lets the user review
 * a live screenshot + the staged values before pressing Apply themselves.
 */
export function AutoFillDialog({
  jobId,
  disabled,
  className,
}: AutoFillDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<AutofillSession | null>(null);
  const sessionRef = useRef<string | null>(null);

  // Keep a ref of the live session id so cleanup can close it reliably.
  useEffect(() => {
    sessionRef.current = session?.sessionId ?? null;
  }, [session]);

  const closeServerSession = useCallback(() => {
    const id = sessionRef.current;
    if (id) {
      sessionRef.current = null;
      void api.closeAutofill(id).catch(() => {});
    }
  }, []);

  // Best-effort cleanup if the component unmounts while a session is open.
  useEffect(() => () => closeServerSession(), [closeServerSession]);

  const start = useCallback(async () => {
    setLoading(true);
    setSession(null);
    try {
      const result = await api.startAutofill(jobId);
      setSession(result);
    } catch (error) {
      showErrorToast(error, "Auto-fill failed");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Opening the dialog only shows the intro — the user explicitly triggers
      // the web scan. Closing tears down the server-side browser session.
      if (!next) {
        closeServerSession();
        setSession(null);
      }
    },
    [closeServerSession],
  );

  const handleRescan = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      setSession(await api.rescanAutofill(session.sessionId));
    } catch (error) {
      showErrorToast(error, "Couldn't re-scan the page");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            fields: prev.fields.map((f) =>
              f.id === fieldId ? { ...f, value } : f,
            ),
          }
        : prev,
    );
  }, []);

  const handleFieldCommit = useCallback(
    async (field: AutofillField) => {
      if (!session) return;
      try {
        const updated = await api.updateAutofillField(
          session.sessionId,
          field.id,
          field.value,
        );
        setSession(updated);
      } catch (error) {
        showErrorToast(error, "Couldn't update field");
      }
    },
    [session],
  );

  const handleRefresh = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      setSession(await api.refreshAutofill(session.sessionId));
    } catch (error) {
      showErrorToast(error, "Couldn't refresh preview");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const result = await api.submitAutofill(session.sessionId);
      setSession(result);
      if (result.status === "submitted") {
        toast.success("Submit clicked — confirm the result in the preview.");
      } else if (result.message) {
        toast.message(result.message);
      }
    } catch (error) {
      showErrorToast(error, "Couldn't submit application");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const filledCount = session?.fields.filter((f) => f.filled).length ?? 0;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        <Wand2 className="size-3.5" />
        Auto-fill
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader className="border-b border-border/40 px-6 py-4">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Auto-fill application
              </DialogTitle>
              <DialogDescription>
                JobOps opens the application page in a browser, scans the form,
                and fills it from your profile. Review everything — nothing is
                submitted until you press Apply.
              </DialogDescription>
            </DialogHeader>

            {loading ? (
              <div className="flex flex-1 items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Opening the application page and scanning the form…
              </div>
            ) : !session ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full border border-border/50 bg-muted/20">
                  <Wand2 className="size-5 text-primary" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Scan the application page and auto-fill it from your profile.
                  This opens the page in a server-side browser — it can take a
                  few seconds.
                </p>
                <Button onClick={() => void start()}>
                  <Sparkles className="size-3.5" />
                  Scan &amp; auto-fill
                </Button>
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
                <div className="overflow-auto border-border/40 bg-muted/10 p-4 md:border-r">
                  {session.screenshot ? (
                    <img
                      src={session.screenshot}
                      alt="Live preview of the application page"
                      className="w-full rounded-md border border-border/40"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No preview available.
                    </p>
                  )}
                </div>

                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2 text-xs text-muted-foreground">
                    <span>
                      {filledCount} of {session.fields.length} fields filled
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRescan()}
                        disabled={busy}
                      >
                        <Wand2 className="size-3.5" />
                        Re-scan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRefresh()}
                        disabled={busy}
                      >
                        <RefreshCcw className="size-3.5" />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-auto px-4 py-3">
                    {session.message ? (
                      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                        {session.message}
                      </p>
                    ) : null}
                    {session.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No form fields were detected on this page.
                      </p>
                    ) : (
                      session.fields.map((field) => (
                        <div key={field.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label
                              htmlFor={`af-${field.id}`}
                              className="truncate text-xs"
                            >
                              {field.label}
                              {field.required ? (
                                <span className="text-rose-400"> *</span>
                              ) : null}
                            </Label>
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[10px] ${confidenceTone[field.confidence]}`}
                            >
                              {field.filled ? "filled" : field.type}
                            </Badge>
                          </div>
                          <Input
                            id={`af-${field.id}`}
                            value={field.value}
                            placeholder={
                              field.type === "file"
                                ? "Upload manually in the page"
                                : "Not filled"
                            }
                            disabled={field.type === "file"}
                            onChange={(e) =>
                              handleFieldChange(field.id, e.target.value)
                            }
                            onBlur={() => void handleFieldCommit(field)}
                          />
                          {field.note ? (
                            <p className="text-[11px] text-muted-foreground">
                              {field.note}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-border/40 px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleSubmit()}
                      disabled={busy || session.status === "submitted"}
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
