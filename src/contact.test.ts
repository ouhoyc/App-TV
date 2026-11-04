import { describe, expect, it } from "vitest";
import { contactUrl } from "./commerce";

describe("Liens de contact", () => {
  it("convertit un numéro français 06 en lien WhatsApp international", () => {
    expect(contactUrl("WhatsApp", "06 12 34 56 78")).toBe(
      "https://wa.me/33612345678",
    );
    expect(contactUrl("WhatsApp", "0612345678")).toBe(
      "https://wa.me/33612345678",
    );
  });
  it("conserve les numéros déjà internationaux", () => {
    expect(contactUrl("WhatsApp", "+33 6 12 34 56 78")).toBe(
      "https://wa.me/33612345678",
    );
    expect(contactUrl("WhatsApp", "0033612345678")).toBe(
      "https://wa.me/33612345678",
    );
    expect(contactUrl("WhatsApp", "+44 7700 900123")).toBe(
      "https://wa.me/447700900123",
    );
  });
  it("laisse le téléphone composer le numéro local", () => {
    expect(contactUrl("Téléphone", "06 12 34 56 78")).toBe("tel:0612345678");
  });
});
