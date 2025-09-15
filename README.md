# Temp Mail Worker

Cloudflare Worker that acts as a temporary email inbox.

## Table of Contents

*   [Features](#features)
*   [Supporters](#supporters)
*   [Community](#community-built-stuff)
*   [Setup Guide](#setup-guide)
    *   [Prerequisites](#prerequisites)
    *   [Project Setup](#project-setup)
    *   [Cloudflare Configuration](#cloudflare-configuration)
        *   [D1 Database Setup](#d1-database-setup)
        *   [KV Namespace Setup](#kv-namespace-setup)
        *   [R2 Bucket Setup](#r2-bucket-setup)
        *   [Email Routing Setup](#email-routing-setup)
*   [Running the Worker](#running-the-worker)
    *   [Cloudflare Information Script (Optional)](#cloudflare-information-script-optional)
    *   [Telegram Logging (Optional)](#telegram-logging-optional)
    *   [Local Development](#local-development)
    *   [Deployment](#deployment)

---

## Features

*   Receives emails via Cloudflare Email Routing.
*   Stores email data in a Cloudflare D1 database.
*   **Attachment**: Not supported.
*   Provides comprehensive API endpoints for emails.
*   Automatically cleans up old emails.

## Community

Here are some projects built by the community using or integrating with Temp Mail Worker:

*   **Rust Library**: [doomed-neko/tmapi](https://github.com/doomed-neko/tmapi/)
*   **Go Library**: [blockton/barid](https://github.com/blockton/barid)
*   **Python Library**: [superhexa/barid-client](https://github.com/superhexa/barid-client)
*   **CLI App**: [doomed-neko/tmcli](https://github.com/doomed-neko/tmcli)

---

## Setup Guide

### Prerequisites

Before you begin, ensure you have the following:

*   **Npm**: Installed on your system.
*   **Cloudflare Account**: With access to Workers, Email Routing, and D1.

### Project Setup

1.  **Install Dependencies**: Install the necessary JavaScript dependencies.
    ```bash
    npm install
    ```

2.  **Login to Cloudflare**: You need to log in to your Cloudflare account via Wrangler. This will open a browser for authentication.
    ```bash
    npm run wrangler login
    ```

### Cloudflare Configuration

#### D1 Database Setup

1.  **Create the D1 database**:
    ```bash
    npm run db:create
    ```
2.  **Copy the `database_id`**: From the output of the above command.
3.  **Update `wrangler.jsonc`**: Open `wrangler.jsonc` and replace `database_id` with the `database_id` you just copied.
4.  **Apply Database Schema**:
    ```bash
    npm run db:tables
    ```
5.  **Apply Database Indexes**:
    ```bash
    npm run db:indexes
    ```

#### KV Namespace Setup

1.  **Create the KV Namespace**:
    ```bash
    npm run kv:create
    ```
2.  **Copy the `id`**: From the output of the above command.
3.  **Update `wrangler.jsonc`**: Open `wrangler.jsonc` and replace `id` and `preview_id` with the `id` you just copied.

#### Email Routing Setup

1.  **Go to your Cloudflare Dashboard**: Select your domain (`example.com`).
2.  **Navigate to "Email" -> "Email Routing"**.
3.  **Enable Email Routing** if it's not already enabled.
4.  **Create a Catch-all Rule**:
    *   For "Action", choose "Send to Worker".
    *   Select your Worker (e.g., `temp-mail`).
    *   Click "Save".

## Running the Worker

### Cloudflare Information Script (Optional)

To check your Cloudflare Workers, D1 databases, KV namespaces, and domain information directly from your terminal, you can use the `cf-info` script.

1.  **Configure API Credentials**: Add your Cloudflare Account ID and an API Token with appropriate permissions (e.g., `Zone:Read`, `Worker Scripts:Read`, `D1:Read`, `KV Storage:Read`, `Zone:Email:Read`) to your `.dev.vars` file.

    Example `.dev.vars` additions:
    ```
    CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
    CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
    ```

2.  **Run the Script**:
    ```bash
    npm run cf-info
    ```

### Telegram Logging (Optional)

If you wish to enable Telegram logging for your worker, follow these steps:

1.  **Enable Logging in `wrangler.jsonc`**: Ensure `TELEGRAM_LOG_ENABLE` is set to `true` in your `wrangler.jsonc` file under the `vars` section.

2.  **Local Development (`.dev.vars`)**: For local development, create a `.dev.vars` file in your project root with your Telegram bot token and chat ID. This file is used by `npm dev`.

    Example `.dev.vars`:
    ```
    TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
    TELEGRAM_CHAT_ID="YOUR_TELEGRAM_CHAT_ID"
    ```

3.  **Production Deployment (Secrets)**: For production, you must set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as secrets using `wrangler`. This securely stores your sensitive information with Cloudflare.

    Run the following commands in your terminal and enter the respective values when prompted:
    ```bash
    npm wrangler secret put TELEGRAM_BOT_TOKEN
    npm wrangler secret put TELEGRAM_CHAT_ID
    ```

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

## Available Scripts

### Development & Deployment
- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run tail` - View live logs from deployed worker

### Database Management
- `npm run db:create` - Create D1 database
- `npm run db:tables` - Apply database schema
- `npm run db:indexes` - Apply database indexes
- `npm run db:migrate-attachments` - Add attachment support to existing database

### Storage Setup
- `npm run kv:create` - Create KV namespace

### Code Quality
- `npm run check` - Run all linting and formatting checks
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run tsc` - Run TypeScript compiler

### Utilities
- `npm run cf-info` - Display Cloudflare account information
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
