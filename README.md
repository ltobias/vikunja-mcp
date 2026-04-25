# Vikunja MCP Server

An MCP (Model Context Protocol) server that connects Claude to your Vikunja instance.

## Setup on Unraid

### 1. Copy files to Unraid
Place these files somewhere on your array, e.g.:
```
/mnt/user/appdata/vikunja-mcp/
```

### 2. Build the Docker image
Open Unraid terminal and run:
```bash
cd /mnt/user/appdata/vikunja-mcp
docker build -t vikunja-mcp .
```

### 3. Run the container
In Unraid terminal:
```bash
docker run -d \
  --name vikunja-mcp \
  --restart unless-stopped \
  -p 3000:3000 \
  -e VIKUNJA_URL=http://your-vikunja-container-name:3456 \
  -e VIKUNJA_TOKEN=your_vikunja_api_token \
  -e MCP_AUTH_TOKEN=choose_a_strong_secret_here \
  vikunja-mcp
```

Or add it via Unraid Docker UI with those environment variables.

**Notes:**
- `VIKUNJA_URL`: Use the container name if on the same Docker network (e.g. `http://vikunja:3456`)
- `VIKUNJA_TOKEN`: Your Vikunja API token from Settings → API Tokens
- `MCP_AUTH_TOKEN`: Make up a strong secret — this is what Claude uses to authenticate

### 4. Expose via Cloudflare Tunnel
In your Cloudflare tunnel config, add a public hostname:
- Subdomain: `vikunja-mcp` (or whatever you prefer)
- Domain: your domain
- Service: `HTTP`
- URL: `localhost:3000`

This gives you a URL like: `https://vikunja-mcp.yourdomain.com`

### 5. Connect to Claude
1. Go to claude.ai → Settings → Connectors
2. Add new connector
3. URL: `https://vikunja-mcp.yourdomain.com/sse`
4. Auth: Bearer token → paste your `MCP_AUTH_TOKEN`

### 6. Test it
Ask Claude: *"List my Vikunja projects"*

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `create_task` | Create a task in a project |
| `list_tasks` | List tasks in a project |
| `complete_task` | Mark a task complete |
| `update_task` | Update task title, due date, priority |

## Security Notes
- Your Vikunja API token stays on your server — Claude never sees it
- The MCP_AUTH_TOKEN protects the MCP endpoint
- Cloudflare tunnel handles TLS
- Health check endpoint `/health` is unauthenticated (safe, read-only)
