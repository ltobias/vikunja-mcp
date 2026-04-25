#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "http";

const VIKUNJA_URL = process.env.VIKUNJA_URL || "http://localhost:3456";
const VIKUNJA_TOKEN = process.env.VIKUNJA_TOKEN;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const PORT = process.env.PORT || 3000;

if (!VIKUNJA_TOKEN) {
  console.error("VIKUNJA_TOKEN environment variable is required");
  process.exit(1);
}

if (!MCP_AUTH_TOKEN) {
  console.error("MCP_AUTH_TOKEN environment variable is required");
  process.exit(1);
}

const vikunjaHeaders = {
  Authorization: `Bearer ${VIKUNJA_TOKEN}`,
  "Content-Type": "application/json",
};

async function vikunjaRequest(method, path, body = null) {
  const response = await fetch(`${VIKUNJA_URL}/api/v1${path}`, {
    method,
    headers: vikunjaHeaders,
    body: body ? JSON.stringify(body) : null,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vikunja API error ${response.status}: ${error}`);
  }
  return response.json();
}

function createMcpServer() {
  const server = new Server(
    { name: "vikunja-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_projects",
        description: "List all Vikunja projects",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "create_task",
        description: "Create a new task in a Vikunja project",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "number", description: "The project ID" },
            title: { type: "string", description: "The task title" },
            description: { type: "string", description: "Optional description" },
            due_date: { type: "string", description: "Due date ISO 8601 e.g. 2024-12-31T00:00:00Z" },
            priority: { type: "number", description: "Priority 0-5 (0=unset, 1=low, 5=urgent)" },
          },
          required: ["project_id", "title"],
        },
      },
      {
        name: "list_tasks",
        description: "List tasks in a project",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "number", description: "The project ID" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "complete_task",
        description: "Mark a task as complete",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "number", description: "The task ID" },
          },
          required: ["task_id"],
        },
      },
      {
        name: "update_task",
        description: "Update an existing task",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "number", description: "The task ID to update" },
            title: { type: "string", description: "New title" },
            description: { type: "string", description: "New description" },
            due_date: { type: "string", description: "New due date ISO 8601" },
            priority: { type: "number", description: "Priority 0-5" },
          },
          required: ["task_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case "list_projects": {
          const projects = await vikunjaRequest("GET", "/projects");
          return {
            content: [{
              type: "text",
              text: JSON.stringify(projects.map((p) => ({ id: p.id, title: p.title })), null, 2),
            }],
          };
        }
        case "create_task": {
          const body = { title: args.title };
          if (args.description) body.description = args.description;
          if (args.due_date) body.due_date = args.due_date;
          if (args.priority !== undefined) body.priority = args.priority;
          const task = await vikunjaRequest("PUT", `/projects/${args.project_id}/tasks`, body);
          return {
            content: [{ type: "text", text: `Task created: "${task.title}" (ID: ${task.id})` }],
          };
        }
        case "list_tasks": {
          const tasks = await vikunjaRequest("GET", `/projects/${args.project_id}/tasks`);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(tasks.map((t) => ({
                id: t.id, title: t.title, done: t.done, due_date: t.due_date, priority: t.priority,
              })), null, 2),
            }],
          };
        }
        case "complete_task": {
          const task = await vikunjaRequest("POST", `/tasks/${args.task_id}`, { done: true });
          return { content: [{ type: "text", text: `Task "${task.title}" marked complete` }] };
        }
        case "update_task": {
          const body = {};
          if (args.title) body.title = args.title;
          if (args.description) body.description = args.description;
          if (args.due_date) body.due_date = args.due_date;
          if (args.priority !== undefined) body.priority = args.priority;
          const task = await vikunjaRequest("POST", `/tasks/${args.task_id}`, body);
          return { content: [{ type: "text", text: `Task "${task.title}" updated` }] };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  });

  return server;
}

const transports = {};

const httpServer = http.createServer(async (req, res) => {
  // Auth check on all routes except health
  if (req.url !== "/health") {
    const { searchParams } = new URL(req.url, `http://localhost:${PORT}`);
    if (searchParams.get("token") !== MCP_AUTH_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else if (req.method === "GET" && req.url === "/sse") {
    const transport = new SSEServerTransport("/messages", res);
    const server = createMcpServer();
    transports[transport.sessionId] = transport;
    await server.connect(transport);
    console.log(`SSE connected: ${transport.sessionId}`);
    req.on("close", () => {
      delete transports[transport.sessionId];
      console.log(`SSE disconnected: ${transport.sessionId}`);
    });
  } else if (req.method === "POST" && req.url.startsWith("/messages")) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const sessionId = url.searchParams.get("sessionId");
    const transport = transports[sessionId];
    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await transport.handlePostMessage(req, res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

httpServer.listen(PORT, () => {
  console.log(`Vikunja MCP server listening on port ${PORT}`);
});
