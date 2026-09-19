/** @type {import('tailwindcss').Config} */
const serif = [
  '"Source Serif 4"', "Charter", '"Iowan Old Style"', "Georgia",
  '"Times New Roman"', "serif",
];
const mono = [
  "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas",
  '"Liberation Mono"', '"Courier New"', "monospace",
];

module.exports = {
  content: [
    "./_layouts/**/*.html",
    "./_includes/**/*.html",
    "./_posts/**/*.md",
    "./_research/**/*.md",
    "./*.html",
    "./*.md",
  ],
  theme: {
    fontFamily: { serif, mono, sans: serif },
    extend: {
      colors: {
        paper: "#ffffff",     // page background
        parchment: "#f5f5f4", // code and quote fills
        rule: "#e7e5e4",      // hairlines
        ink: "#1c1917",
        oxblood: "#7f1d1d",
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            fontFamily: serif.join(", "),
            fontSize: "1.0625rem", // 17px
            lineHeight: "1.55",
            color: theme("colors.ink"),
            maxWidth: "none",
            a: {
              color: theme("colors.blue.900"),
              textDecoration: "underline",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
              fontWeight: "400",
              "&:hover": { color: theme("colors.black") },
            },
            "h1, h2, h3, h4": {
              color: theme("colors.ink"),
              fontWeight: "600",
              letterSpacing: "-0.01em",
            },
            h2: { fontSize: "1.25em", marginTop: "1.8em", marginBottom: "0.6em", lineHeight: "1.3" },
            h3: { fontSize: "1.05em", marginTop: "1.5em", marginBottom: "0.5em" },
            strong: { color: theme("colors.ink"), fontWeight: "600" },
            code: {
              fontFamily: mono.join(", "),
              fontSize: "0.8235em", // 14px
              fontWeight: "400",
              color: theme("colors.ink"),
              backgroundColor: theme("colors.parchment"),
              padding: "0 0.25em",
              borderRadius: "0",
            },
            "code::before": { content: '""' },
            "code::after": { content: '""' },
            pre: {
              fontFamily: mono.join(", "),
              fontSize: "0.8235em",
              lineHeight: "1.5",
              color: theme("colors.ink"),
              backgroundColor: theme("colors.parchment"),
              border: `1px solid ${theme("colors.rule")}`,
              borderRadius: "0",
              padding: "0.7em 0.9em",
            },
            "pre code": { backgroundColor: "transparent", padding: "0", fontSize: "1em" },
            blockquote: {
              fontStyle: "italic",
              fontWeight: "400",
              color: theme("colors.stone.700"),
              borderLeftWidth: "3px",
              borderLeftColor: theme("colors.rule"),
              paddingLeft: "1em",
            },
            "blockquote p:first-of-type::before": { content: '""' },
            "blockquote p:last-of-type::after": { content: '""' },
            table: { fontSize: "0.9412em" },
            "thead th": {
              fontFamily: mono.join(", "),
              fontSize: "0.75em",
              fontWeight: "600",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: theme("colors.stone.500"),
            },
            "thead, tbody tr": { borderColor: theme("colors.rule") },
            hr: { borderColor: theme("colors.rule") },
            img: { marginLeft: "auto", marginRight: "auto" },
          },
        },
      }),
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
