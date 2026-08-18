# Sharing a local dev server with ngrok

Sometimes it's useful to let someone else (or your own phone) hit your local
`pnpm dev` server over the internet — for a quick demo, or to test the
mobile layout on a real device. [ngrok](https://ngrok.com) creates a public
URL that tunnels to a port on your machine.

## Install

**macOS** (Homebrew):

```bash
brew install ngrok/ngrok/ngrok
```

No Homebrew? Download from [ngrok.com/download](https://ngrok.com/download),
unzip, then move it onto your PATH:

```bash
sudo mv ~/Downloads/ngrok /usr/local/bin/
```

**Windows** (winget, built into Windows 10/11):

```powershell
winget install ngrok
```

Or with Chocolatey:

```powershell
choco install ngrok
```

No package manager? Download the zip from
[ngrok.com/download](https://ngrok.com/download), extract it, and either add
that folder to your PATH or run `ngrok.exe` from inside it.

## One-time setup

1. Sign up free at [ngrok.com](https://ngrok.com).
2. Grab your authtoken from the dashboard's "Your Authtoken" page.
3. In a terminal:

   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

Everyone should use their **own** authtoken — don't share tokens between
people.

## Running it

1. Start the dev server as usual, in the repo:

   ```bash
   pnpm dev
   ```

2. In a **second** terminal window, tunnel it (this repo's dev server runs
   on port 5173 by default):

   ```bash
   ngrok http 5173
   ```

ngrok prints a public URL like `https://xxxx.ngrok-free.app` — open that on
a phone or share it with someone else.

**Close the tunnel (`Ctrl-C`) when you're done.** While it's open, anyone
with the URL can reach your local dev server.

## Troubleshooting: "Blocked request. This host is not allowed"

Vite rejects requests whose `Host` header it doesn't recognize, as a
security measure — an ngrok URL will trip this. Fix it by adding the ngrok
domains to `server.allowedHosts` in `vite.config.ts`:

```ts
export default defineConfig({
  // ...
  server: {
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
  },
});
```

Restart `pnpm dev` after adding this — Vite only reads config on startup.
