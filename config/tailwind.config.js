/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        "pulse-ring": {
          "0%": { transform: "scale(.85)", opacity: ".65" },
          "80%,100%": { transform: "scale(1.6)", opacity: "0" }
        }
      },
      animation: {
        "fade-in": "fade-in .25s ease-out both",
        "slide-in": "slide-in .28s cubic-bezier(.22,1,.36,1) both",
        "toast-in": "toast-in .22s ease-out both",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(.4,0,.6,1) infinite"
      }
    }
  },
  plugins: []
};
