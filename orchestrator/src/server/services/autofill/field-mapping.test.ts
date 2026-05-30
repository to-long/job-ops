import { describe, expect, it } from "vitest";
import type { DetectedField } from "./field-detection";
import { buildMappingMessages } from "./field-mapping";
import type { ProfileFillData } from "./profile-fill-data";

const profile: ProfileFillData = {
  values: { firstName: "Ada", email: "ada@example.com" },
  keys: ["firstName", "email"],
};

const fields: DetectedField[] = [
  {
    id: "af-0",
    selector: '[data-jobops-af="af-0"]',
    label: "First name",
    type: "text",
    required: true,
    currentValue: "",
  },
  {
    id: "af-1",
    selector: '[data-jobops-af="af-1"]',
    label: "Country",
    type: "select",
    required: false,
    currentValue: "",
    options: ["United Kingdom", "United States"],
  },
];

describe("buildMappingMessages", () => {
  it("includes a system and user message", () => {
    const messages = buildMappingMessages(fields, profile, null);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("describes fields and profile keys in the text content", () => {
    const messages = buildMappingMessages(fields, profile, null);
    const text = messages[1].content as string;
    expect(text).toContain("id=af-0");
    expect(text).toContain("First name");
    expect(text).toContain("options=[United Kingdom | United States]");
    expect(text).toContain("firstName");
    expect(text).toContain("email");
  });

  it("attaches the screenshot as an image part when provided", () => {
    const messages = buildMappingMessages(
      fields,
      profile,
      "data:image/png;base64,AAAA",
    );
    const parts = messages[1].content;
    expect(Array.isArray(parts)).toBe(true);
    if (Array.isArray(parts)) {
      const image = parts.find((p) => p.type === "image");
      expect(image).toBeDefined();
    }
  });

  it("keeps content as plain text when no valid screenshot is given", () => {
    const messages = buildMappingMessages(fields, profile, "not-a-data-url");
    expect(typeof messages[1].content).toBe("string");
  });
});
