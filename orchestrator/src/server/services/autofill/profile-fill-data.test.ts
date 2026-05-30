import type { ResumeProfile } from "@shared/types";
import { describe, expect, it } from "vitest";
import { buildProfileFillData } from "./profile-fill-data";

function makeProfile(): ResumeProfile {
  return {
    basics: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+44 20 7946 0000",
      headline: "Software Engineer",
      url: "https://ada.dev",
      summary: "Pioneer.",
      location: {
        address: "12 Baker St",
        city: "London",
        region: "England",
        postalCode: "NW1",
        countryCode: "GB",
      },
      profiles: [
        { network: "LinkedIn", username: "ada", url: "https://lnkd.in/ada" },
        {
          network: "GitHub",
          username: "ada-gh",
          url: "https://github.com/ada-gh",
        },
      ],
    },
  };
}

describe("buildProfileFillData", () => {
  it("flattens basics into fillable keys", () => {
    const { values } = buildProfileFillData(makeProfile());
    expect(values.fullName).toBe("Ada Lovelace");
    expect(values.firstName).toBe("Ada");
    expect(values.lastName).toBe("Lovelace");
    expect(values.email).toBe("ada@example.com");
    expect(values.phone).toBe("+44 20 7946 0000");
    expect(values.city).toBe("London");
    expect(values.countryCode).toBe("GB");
    expect(values.website).toBe("https://ada.dev");
  });

  it("builds a combined location string", () => {
    const { values } = buildProfileFillData(makeProfile());
    expect(values.location).toContain("London");
    expect(values.location).toContain("GB");
  });

  it("derives network keys from profiles", () => {
    const { values } = buildProfileFillData(makeProfile());
    expect(values.linkedinUrl).toBe("https://lnkd.in/ada");
    expect(values.githubUrl).toBe("https://github.com/ada-gh");
    expect(values.githubUsername).toBe("ada-gh");
  });

  it("splits a single-word name without a last name", () => {
    const { values } = buildProfileFillData({ basics: { name: "Cher" } });
    expect(values.firstName).toBe("Cher");
    expect(values.lastName).toBeUndefined();
  });

  it("omits empty values entirely", () => {
    const { values, keys } = buildProfileFillData({ basics: {} });
    expect(keys).toHaveLength(0);
    expect(values).toEqual({});
  });
});
