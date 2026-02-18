# TARS

An autonomous AI agent you interact with through a chat interface. Built with Next.js, the Claude Agent SDK, and MongoDB.

## Prerequisites

- **Node.js** 20 or later
- **Anthropic API key**
- **MongoDB** — either an existing database or a free MongoDB Atlas account (the setup wizard can create one for you)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add your Anthropic API key

Create a `.env.local` file with your API key:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Get a key from [console.anthropic.com](https://console.anthropic.com/). Navigate to **API Keys** and create a new one.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Complete the setup wizard

On first run, the setup wizard will guide you through:

1. **Database connection** — choose one:
   - **Auto setup with Atlas** — enter your Atlas API keys and TARS will create a free M0 cluster, database user, and network access automatically. Create API keys at [Atlas → Organization Access → API Keys](https://cloud.mongodb.com/v2#/org/access/apiKeys) with the **Organization Owner** role.
   - **Manual URI** — paste a `mongodb+srv://` or `mongodb://` connection string from an existing cluster.
2. **Password** — create a password to secure your instance. Hashed with bcrypt and stored in MongoDB.

The wizard writes `MONGODB_URI` and `SESSION_SECRET` (auto-generated) to `.env.local` for you.

## Build for production

```bash
npm run build
npm start
```
