/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0a111c",
          800: "#111c2a",
          700: "#1b293c"
        },
        accent: {
          400: "#3b82f6",
          500: "#2563eb"
        }
      },
      boxShadow: {
        panel: "0 15px 50px rgba(3, 8, 20, 0.35)"
      }
    }
  },
  plugins: []
};
