// A cosmetic filter for email addresses and phone numbers. Original text stays intact.
const redactionPattern =
  /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?<!\w)\+?\d[\d ().-]{6,}\d(?!\w))/gi;

export function RedactedText({ children }: { children: string }) {
  return children.split(redactionPattern).map((part, index) => {
    if (index % 2 === 0) return part;
    // Keep dates and short quantities readable; only long digit groups resemble phones.
    const numeric = /^\+?\d/.test(part);
    if (
      numeric &&
      !part.includes("@") &&
      (part.replace(/\D/g, "").length < 8 ||
        /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(part) ||
        /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(part))
    )
      return part;
    return (
      <span className="redactable-text" key={index}>
        {part}
      </span>
    );
  });
}
