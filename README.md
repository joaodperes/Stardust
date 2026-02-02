# 🚀 Stardust Colony

An idle/incremental space colony management game built with vanilla JavaScript, Vite, and Firebase.

## 🎮 Features

- **Resource Management**: Mine Metal, Crystal, and Deuterium
- **Building System**: Construct and upgrade facilities to increase production
- **Research Tech Tree**: Unlock technologies to boost efficiency and unlock new buildings
- **Ship Production**: Build various spacecraft with unique stats
- **Energy System**: Manage energy production/consumption balance
- **Cloud Saves**: Login with Firebase to save progress across devices
- **Offline Production**: Game continues producing resources while offline
- **Idle Gameplay**: Progression happens automatically

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Build Tool**: Vite
- **Backend**: Firebase (Authentication, Realtime Database, Hosting)
- **Version Control**: Git/GitHub with automated deployments

## 📋 Prerequisites

- Node.js (v16+)
- npm
- Firebase project (free tier available)
- Git

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/joaodperes/Stardust.git
cd Stardust
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Firebase

Create a `.env.local` file in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com/
VITE_FIREBASE_APP_ID=your_app_id
```

**⚠️ Important**: do not remove `.env.local` from `.gitignore`

### 4. Run Locally

```bash
npm run dev
```

Visit `http://localhost:5173/Stardust/` and start playing!

## 🎮 How to Play

### Getting Started
- **Login** with email/password or continue as guest (uses browser storage)
- **Build** basic resource extractors (Metal Mine, Crystal Mine, Deuterium Extractor)
- **Monitor Energy** - negative energy reduces production by 90%
- **Research** technologies to unlock new buildings and boost production

### Progression
1. Unlock new buildings through requirements and research
2. Balance resource production with energy consumption
3. Build ships for future gameplay mechanics
4. Watch your colony expand and prosper!

### Cloud Features
- **Auto-Save**: Progress saves automatically every few seconds
- **Cloud Sync**: Manual sync button available when logged in
- **Cross-Device**: Login on any device to continue your game

## 🏗️ Project Structure

```
Stardust/
├── src/
│   ├── main.js           # Core game loop and UI controller
│   ├── gameData.js       # Game state and building definitions
│   ├── economy.js        # Production and cost calculations
│   └── firebase.js       # Firebase configuration
├── assets/               # Game images and icons
├── style.css            # Global styles
├── index.html           # Main HTML file
├── vite.config.js       # Vite configuration
├── package.json
└── .env.local           # Firebase credentials (not committed)
```

## 📦 Building for Production

```bash
npm run build
```

Output is generated in the `dist/` folder.

## 🌐 Deployment

The project is configured for automatic deployment to Firebase Hosting via GitHub Actions.

### First-Time Setup
1. GitHub Secrets were automatically created during `firebase init`
2. Add Firebase environment variables to GitHub Secrets (see Configuration section above)

### Automatic Deployment
Every push to the main branch triggers:
1. Clean install: `npm ci`
2. Production build: `npm run build`
3. Firebase deployment: `firebase deploy`

## 🔐 Security

- **API Keys**: Stored in GitHub Secrets
- **Database Rules**: Only authenticated users can read/write their own data
- **Environment Variables**: Vite injects secrets at build time

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth.uid === $uid",
        ".write": "auth.uid === $uid"
      }
    }
  }
}
```

## 🎨 Customization

### Adding New Buildings
Edit `gameData.js` and add to the `buildings` object:

```javascript
yourBuilding: {
    name: "Your Building",
    desc: "Description",
    level: 0,
    cost: { metal: 100, crystal: 50, deuterium: 0 },
    growth: 1.5,
    baseTime: 30,
    timeGrowth: 1.1,
    baseProd: 5,
    energyWeight: -1,
    req: { otherBuilding: 1 }
}
```

### Styling
Modify `style.css` for different themes and layouts.

## 🐛 Troubleshooting

### "Firebase error - URL not configured correctly"
- Verify `VITE_FIREBASE_DATABASE_URL` in `.env.local` is correct
- Restart dev server: `Ctrl+C` then `npm run dev`

### Login modal not showing
- Check browser console (`F12`) for errors
- Verify Firebase credentials in `.env.local`
- Hard refresh: `Ctrl+Shift+R`

### Game doesn't save
- Check you're logged in (login button visible, not logout)
- Verify GitHub Secrets are set for production
- Check Firebase Database rules allow writes

## 📝 License

See LICENSE file for details.

## 🤝 Contributing

Feel free to fork and submit pull requests!

## 📧 Contact

Questions? Open an issue on GitHub!

---

**Happy colonizing! 🌍✨**
