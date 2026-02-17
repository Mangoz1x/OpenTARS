# TARS

An autonomous AI agent you interact with through a chat interface. Built with Next.js, the Claude Agent SDK, and MongoDB.

## Prerequisites

- **Node.js** 20 or later
- **MongoDB** database (local or Atlas)
- **Anthropic API key**

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env.local
```

Your `.env.local` needs four variables:

```
TARS_PASSWORD=changeme
SESSION_SECRET=replace-with-random-32-char-string
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/tars?retryWrites=true&w=majority
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Each one is explained below.

---

### `MONGODB_URI`

TARS stores conversations, messages, and session state in MongoDB.

**Using MongoDB Atlas (free tier):**

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a free account.
2. Create a new cluster (the free **M0** tier works fine).
3. In **Database Access**, create a database user with a username and password.
4. In **Network Access**, add your IP address (or `0.0.0.0/0` for development).
5. Click **Connect** on your cluster, choose **Drivers**, and copy the connection string.
6. Replace `<user>`, `<password>`, and `<cluster>` in the URI with your actual values. The database name (`tars` in the example) can be whatever you want.

**Using a local MongoDB instance:**

```
MONGODB_URI=mongodb://localhost:27017/tars
```

---

### `ANTHROPIC_API_KEY`

This is the API key TARS uses to talk to Claude.

1. Go to [console.anthropic.com](https://console.anthropic.com/).
2. Sign in or create an account.
3. Navigate to **API Keys** and create a new key.
4. Copy the key (starts with `sk-ant-api03-`) and paste it into your `.env.local`.

You'll need credits on your Anthropic account. Check the [pricing page](https://www.anthropic.com/pricing) for details.

---

### `SESSION_SECRET`

Used to sign session cookies (JWT-based, HS256). This should be a random string at least 32 characters long.

Generate one with:

```bash
openssl rand -hex 32
```

Or on Windows (PowerShell):

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Keep this secret. If you change it, all existing sessions are invalidated and users will need to log in again.

---

### `TARS_PASSWORD`

TARS is protected by a single shared password. When you open the app, you're prompted to enter this password before you can access the chat. Think of it as a simple lock on the front door -- there are no user accounts.

Set it to whatever you want. Anyone who needs access to your TARS instance needs this password.

---

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your `TARS_PASSWORD`.

## Build for production

```bash
npm run build
npm start
```
