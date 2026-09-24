// Tailwind was configured here but never generated a single rule: globals.css
// has no @tailwind directive (checked against the built CSS), and the last
// components that carried utility classes were dead code. Removed in V2
// group D — autoprefixer is all the pipeline actually used.
const config = {
  plugins: {
    autoprefixer: {},
  },
};

export default config;
