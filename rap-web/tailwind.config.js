module.exports = {
  content: [
    './index.html',
    './src/**/*.html',
    './src/**/*.js',
    './src/**/*.jsx',
    './src/**/*.ts',
    './src/**/*.tsx',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms'),],
};