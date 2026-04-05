# Temp Mail Worker

Cloudflare Worker that acts as a temporary email inbox.

## Table of Contents

*   [Features](#features)
*   [Setup Guide](#setup-guide)
    *   [Prerequisites](#prerequisites)
    *   [Project Setup](#project-setup)
    *   [Cloudflare Configuration](#cloudflare-configuration)
        *   [D1 Database Setup](#d1-database-setup)
        *   [KV Namespace Setup](#kv-namespace-setup)
        *   [Email Routing Setup](#email-routing-setup)
*   [Running the Worker](#running-the-worker)
    *   [Local Development](#local-development)
    *   [Deployment](#deployment)
*   [Available Scripts](#available-scripts)
*   [API Endpoints](#api-endpoints)

---

## Features

*   Receives emails via Cloudflare Email Routing.
*   Stores email data in a Cloudflare D1 database.
*   **Telegram Bot Interface**: Manage addresses and read emails directly in Telegram.
*   Provides comprehensive API endpoints via Hono.
*   Automatically cleans up old emails and expired addresses.

---

## Setup Guide

### Prerequisites

Before you begin, ensure you have the following:

*   **Npm**: Installed on your system.
*   **Cloudflare Account**: With access to Workers, Email Routing, D1, and KV.
*   **Telegram Bot**: Create one via [@BotFather](https://t.me/BotFather) and get your `ADMIN_ID` (your user ID).

### Project Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Login to Cloudflare**:
    ```bash
    npx wrangler login
    ```

### Cloudflare Configuration

Navigate to the worker directory:
```bash
cd app/workers
```

#### D1 Database Setup

1.  **Create the D1 database**:
    ```bash
    npm run db:create
    ```
2.  **Copy the `database_id`** from the output.
3.  **Update `wrangler.jsonc`**: Open `wrangler.jsonc` and replace `database_id` with your ID.
4.  **Apply Database Schema & Indexes**:
    ```bash
    npm run db:tables
    npm run db:indexes
    ```

#### KV Namespace Setup

1.  **Create the KV Namespace**:
    ```bash
    npm run kv:create
    ```
2.  **Copy the `id`** and update it in `wrangler.jsonc` (both `id` and `preview_id`).

#### Email Routing Setup

1.  **Go to Cloudflare Dashboard**: Select your domain.
2.  **Navigate to "Email" -> "Email Routing"**.
3.  **Create a Catch-all Rule**:
    *   For "Action", choose "Send to Worker".
    *   Select your Worker (e.g., `temp-mail`).

## Running the Worker

### Local Development

To run the worker locally:
```bash
npm run dev
```

### Deployment

To deploy your worker to Cloudflare:
```bash
npm run deploy
```

Set your Telegram Bot Token as a secret:
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

## Available Scripts (app/workers)

- `npm run dev` - Start local development server (remote mode)
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run tail` - View live logs from deployed worker
- `npm run db:create` - Create D1 database
- `npm run db:tables` - Apply database schema
- `npm run db:indexes` - Apply database indexes
- `npm run kv:create` - Create KV namespace
- `npm run check` - Run all linting and formatting checks
- `npm run lint` - Run Biome lint
- `npm run format` - Format code with Biome
- `npm run tsc` - Run TypeScript compiler (noEmit)
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare bindings

## API Endpoints

### Email Endpoints

- `GET /emails/{emailAddress}` - Get emails for a specific address
- `GET /emails/count/{emailAddress}` - Get email count for a specific address
- `GET /inbox/{emailId}` - Get a specific email by ID
- `DELETE /emails/{emailAddress}` - Delete all emails for a specific address
- `DELETE /inbox/{emailId}` - Delete a specific email by ID
- `GET /domains` - Get list of supported domains

### Health Check

- `GET /health` - Service health status

For complete API documentation with examples, visit: [https://mail-api.alikuxac.xyz](https://mail-api.alikuxac.xyz)
