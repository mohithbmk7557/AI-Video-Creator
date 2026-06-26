const appJson = require('./app.json');
const expo = appJson.expo;

const devDomain = process.env.REPLIT_DEV_DOMAIN;

module.exports = {
  ...expo,
  extra: {
    ...expo.extra,
    router: {
      ...expo.extra?.router,
      // Allow the Replit canvas/preview domain so the CORS middleware accepts iframe requests
      ...(devDomain
        ? {
            origin: `https://${devDomain}`,
            headOrigin: `https://${devDomain}`,
          }
        : {}),
    },
  },
  // Keep the expo-router plugin origin unchanged for production
  plugins: expo.plugins,
};
