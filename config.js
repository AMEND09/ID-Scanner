// Configuration
// Load your Google OAuth credentials here
export const CONFIG = {
    GOOGLE_CLIENT_ID: '386374629185-hfpjmmpttb4sreas6l3fb9nvlo62jril.apps.googleusercontent.com',
    GOOGLE_API_KEY: '', // Optional - can be left empty, but recommended for quota tracking
};

// To use environment variables, you'll need to use a build tool or load from a server
// For now, replace the values above with your actual credentials
// Or use a simple approach with a .env-like setup:

// Option 1: Direct replacement (simplest for static hosting)
// Just replace YOUR_CLIENT_ID_HERE and YOUR_API_KEY_HERE above

// Option 2: Load from a separate config file that you don't commit to git
// Create a file called config.local.js with:
// export const CONFIG = { GOOGLE_CLIENT_ID: 'your-actual-id', ... };
// And add config.local.js to .gitignore
