/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4 はクラスの並び順をこの CSS から判断する
  tailwindStylesheet: "./apps/web/src/index.css",
  tailwindFunctions: ["cn", "cva"],
};
