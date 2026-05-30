import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { AutofillField, AutofillFieldConfidence } from "@shared/types";
import type { JsonSchemaDefinition, LlmMessage } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import type { DetectedField } from "./field-detection";
import type { ProfileFillData } from "./profile-fill-data";

/** What the LLM returns for each field it analysed. */
interface FieldMappingResult {
  id: string;
  profileKey: string | null;
  confidence: AutofillFieldConfidence;
  note?: string;
}

export const FIELD_MAPPING_SCHEMA: JsonSchemaDefinition = {
  name: "autofill_field_mapping",
  schema: {
    type: "object",
    properties: {
      mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The field id to map." },
            profileKey: {
              type: ["string", "null"],
              description:
                "The profile attribute to fill, or null to leave blank.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low", "none"],
            },
            note: {
              type: "string",
              description: "Optional short reason, e.g. why left blank.",
            },
          },
          required: ["id", "profileKey", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["mappings"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You map job-application form fields to a candidate's profile attributes.

You are given:
- A list of form fields detected on the page (id, label, type, options).
- A screenshot of the application page for visual context (labels, grouping, required markers the DOM may miss).
- The available profile attribute keys you may fill from.

For each field, choose the single best profile key, or null if no profile key fits (e.g. cover letter, "why do you want to work here", security questions, salary, work-authorization yes/no, file uploads). Never invent values; only reference the provided keys. Prefer leaving a field blank (null) over a wrong guess. For select/radio fields only map when a profile key clearly corresponds (e.g. country). Return a mapping for every field id.`;

/**
 * Builds the messages for the field-mapping LLM call. Pure so the prompt shape
 * can be asserted in tests without invoking a model.
 */
export function buildMappingMessages(
  fields: DetectedField[],
  profile: ProfileFillData,
  screenshotDataUrl: string | null,
): LlmMessage[] {
  const fieldLines = fields.map((f) => {
    const opts =
      f.options && f.options.length > 0
        ? ` options=[${f.options.slice(0, 12).join(" | ")}]`
        : "";
    return `- id=${f.id} type=${f.type} required=${f.required} label=${JSON.stringify(
      f.label,
    )}${opts}`;
  });

  const profileLines = profile.keys.map(
    (key) => `- ${key}: ${JSON.stringify(profile.values[key])}`,
  );

  const text = [
    "FORM FIELDS:",
    fieldLines.join("\n") || "(none)",
    "",
    "AVAILABLE PROFILE KEYS:",
    profileLines.join("\n") || "(none)",
  ].join("\n");

  const userParts: LlmMessage["content"] = screenshotDataUrl?.startsWith(
    "data:image/",
  )
    ? [
        { type: "text", text },
        {
          type: "image",
          imageUrl: screenshotDataUrl,
          mediaType: "image/png",
          name: "application-form",
        },
      ]
    : text;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts },
  ];
}

/**
 * Asks the configured (vision-capable) LLM to map each detected field to a
 * profile key, then materialises the fill value. Fields the model can't place
 * are returned unfilled with a note so the user can complete them by hand.
 */
export async function mapFieldsToProfile(
  fields: DetectedField[],
  profile: ProfileFillData,
  screenshotDataUrl: string | null,
): Promise<AutofillField[]> {
  if (fields.length === 0) return [];

  const baseFields: AutofillField[] = fields.map((f) => ({
    id: f.id,
    label: f.label || f.id,
    type: f.type,
    profileKey: null,
    value: "",
    filled: false,
    confidence: "none",
    required: f.required,
    options: f.options,
  }));

  let mappings: FieldMappingResult[] = [];
  try {
    const [model, llm] = await Promise.all([
      resolveLlmModel("tailoring"),
      createConfiguredLlmService("tailoring"),
    ]);
    const result = await llm.callJson<{ mappings: FieldMappingResult[] }>({
      model,
      messages: buildMappingMessages(fields, profile, screenshotDataUrl),
      jsonSchema: FIELD_MAPPING_SCHEMA,
      maxRetries: 1,
      retryDelayMs: 300,
    });
    if (result.success) {
      mappings = Array.isArray(result.data.mappings)
        ? result.data.mappings
        : [];
    } else {
      logger.warn("Autofill field mapping failed", {
        error: sanitizeUnknown(result.error),
      });
    }
  } catch (error) {
    logger.warn("Autofill field mapping threw", {
      error: sanitizeUnknown(error),
    });
  }

  const byId = new Map(baseFields.map((f) => [f.id, f]));
  for (const mapping of mappings) {
    const field = byId.get(mapping.id);
    if (!field) continue;
    const key = mapping.profileKey;
    field.confidence = mapping.confidence ?? "none";
    if (mapping.note) field.note = mapping.note;
    if (key && Object.hasOwn(profile.values, key)) {
      field.profileKey = key;
      field.value = profile.values[key];
    }
  }

  return baseFields;
}
