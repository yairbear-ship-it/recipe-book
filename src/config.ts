// Google OAuth Client ID — created in Google Cloud Console for this app.
// Safe to commit: this is a public identifier, not a secret.
export const GOOGLE_CLIENT_ID =
  '541046562326-3jo077hpclatqtaib5hjp3mef64phqah.apps.googleusercontent.com'

// Scopes:
// - `drive.file` is the least-privilege Drive scope — we can only see files
//   this app created itself.
// - `userinfo.email` lets us label the connected account in the UI.
export const GOOGLE_DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'

// The folder name on the user's Drive where backups live.
export const DRIVE_FOLDER_NAME = 'Recipe Book'

// The single metadata file inside the folder.
export const DRIVE_INDEX_FILE_NAME = 'index.json'
