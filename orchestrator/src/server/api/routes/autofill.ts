import { badRequest, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import {
  closeAutofill,
  refreshAutofill,
  startAutofill,
  submitAutofill,
  updateAutofillField,
} from "@server/services/autofill";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const autofillRouter = Router();

const startSchema = z.object({
  jobId: z.string().trim().min(1).max(100),
});

autofillRouter.post("/start", async (req: Request, res: Response) => {
  try {
    const input = startSchema.parse(req.body ?? {});
    const session = await startAutofill(input.jobId);
    ok(res, { session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, toAppError(error));
  }
});

const updateSchema = z.object({
  fieldId: z.string().trim().min(1).max(100),
  value: z.string().max(20000),
});

autofillRouter.post(
  "/:sessionId/update",
  async (req: Request, res: Response) => {
    try {
      const input = updateSchema.parse(req.body ?? {});
      const session = await updateAutofillField(
        req.params.sessionId,
        input.fieldId,
        input.value,
      );
      ok(res, { session });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return fail(res, badRequest(error.message, error.flatten()));
      }
      fail(res, toAppError(error));
    }
  },
);

autofillRouter.post(
  "/:sessionId/screenshot",
  async (req: Request, res: Response) => {
    try {
      const session = await refreshAutofill(req.params.sessionId);
      ok(res, { session });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

autofillRouter.post(
  "/:sessionId/submit",
  async (req: Request, res: Response) => {
    try {
      const session = await submitAutofill(req.params.sessionId);
      ok(res, { session });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

autofillRouter.post(
  "/:sessionId/close",
  async (req: Request, res: Response) => {
    try {
      await closeAutofill(req.params.sessionId);
      ok(res, { closed: true });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);
