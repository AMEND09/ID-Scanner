# Barcode Scanner - Google Sheets Logger

A mobile-friendly web app for scanning barcodes/QR codes and logging them to Google Sheets with timestamps.

## Features

- 📱 Mobile-optimized interface
- 📷 Camera-based barcode/QR code scanning
- ⌨️ Manual entry option for 9-10 digit codes
- 📊 Direct integration with Google Sheets
- 💾 Caches selected spreadsheet
- 🔐 Secure OAuth 2.0 authentication
- ⚡ No backend required - runs entirely in the browser
- 📝 Shows recent scans with success/failure status

## Setup Instructions

### 1. Set up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Sheets API
   - Google Drive API

### 2. Create OAuth 2.0 Credentials

1. In Google Cloud Console, go to "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Web application"
4. Add authorized JavaScript origins:
   - `http://localhost:8000` (for local testing)
   - Your production domain (e.g., `https://yourdomain.com`)
5. Add authorized redirect URIs (same as above)
6. Copy the **Client ID**

### 3. Create API Key

1. In Google Cloud Console, go to "Credentials"
2. Click "Create Credentials" → "API Key"
3. Restrict the key to:
   - HTTP referrers (your domain)
   - Google Sheets API and Google Drive API
4. Copy the **API Key**

### 4. Configure the App

Open `config.js` and replace the placeholder values:

```javascript
export const CONFIG = {
    GOOGLE_CLIENT_ID: 'your-client-id.apps.googleusercontent.com',
    GOOGLE_API_KEY: 'your-api-key',
    GOOGLE_CLIENT_SECRET: 'not-needed-for-client-side'
};
```

**Security Note:** For production, consider using environment variables or a build process to inject these values.

### 5. Run the App

Since this uses ES6 modules, you need to serve it through a web server:

#### Option A: Python (if installed)
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

#### Option B: Node.js http-server
```bash
npx http-server -p 8000
```

#### Option C: VS Code Live Server Extension
1. Install "Live Server" extension
2. Right-click `index.html` → "Open with Live Server"

Then open your browser to `http://localhost:8000`

## Usage

1. **Sign In**: Click "Sign in with Google" and authorize the app
2. **Select Sheet**: Choose which Google Spreadsheet to log scans to
3. **Start Scanning**: 
   - Point your camera at a barcode/QR code
   - Or manually enter a 9-10 digit code
4. **View Results**: See recent scans and their status

## Data Format

The app appends data to your Google Sheet with the following columns:
- Column A: Barcode/QR Code (9-10 digits)
- Column B: Date
- Column C: Time

## Supported Barcode Formats

- Code 128
- EAN-13
- EAN-8
- Code 39
- UPC-A
- UPC-E
- Codabar
- ITF (Interleaved 2 of 5)

## Browser Compatibility

- Chrome/Edge (Recommended)
- Safari (iOS 11+)
- Firefox

**Note:** Camera access requires HTTPS in production (HTTP works for localhost only)

## Troubleshooting

### Camera not working
- Ensure you've granted camera permissions
- Use HTTPS (required for camera access except on localhost)
- Try a different browser

### "Authorization failed"
- Check that your OAuth client ID is correct
- Verify authorized JavaScript origins include your domain
- Clear browser cache and try again

### Can't see spreadsheets
- Ensure Google Drive API is enabled
- Check that you've granted the necessary permissions

## Deployment

### Option 1: GitHub Pages
1. Push code to GitHub
2. Go to Settings → Pages
3. Select branch and folder
4. Update OAuth authorized origins with your GitHub Pages URL

### Option 2: Netlify/Vercel
1. Connect your repository
2. Deploy (no build command needed)
3. Update OAuth authorized origins

### Option 3: Static hosting
Upload all files to any static hosting service (AWS S3, Azure Storage, etc.)

## Security Considerations

- Never commit `config.local.js` or credentials to Git
- Use API key restrictions in Google Cloud Console
- Consider using a separate config file for production
- Implement rate limiting if needed

## License

MIT License - feel free to use and modify for your needs
