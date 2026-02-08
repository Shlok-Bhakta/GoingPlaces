# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Running on a physical device (Expo Go)

If the app works on your Mac but **not on your iPhone** when both are on the same network:

1. **Use tunnel mode** so your phone can reach the dev server (avoids firewall/LAN issues):
   ```bash
   npx expo start --tunnel
   ```
   Scan the QR code with the Camera app; it will open in Expo Go. (Requires [Expo account](https://expo.dev) and `npx expo install @expo/ngrok` the first time.)

2. **Point the app at your machine’s IP for the chat backend.**  
   Copy `.env.example` to `.env` (or `.env.local`) and set your PC’s LAN IP (not `localhost`):
   ```bash
   EXPO_PUBLIC_CHAT_WS_BASE=http://YOUR_PC_IP:8000
   ```
   Example: if your PC is `192.168.1.10`, use `http://192.168.1.10:8000`.  
   Find your IP: `ip addr` (Linux) or `ipconfig` (Windows).  
   The Python backend must be running on that machine (`cd backend && uvicorn main:app --host 0.0.0.0 --port 8000`).

3. **If you prefer LAN instead of tunnel**, ensure your firewall allows the Metro port:
   ```bash
   sudo ufw allow 8081/tcp   # Linux (if using ufw)
   ```
   Then run `npx expo start` and scan the QR code that shows `exp://192.168.x.x:8081` (use that URL, not the localhost one).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
