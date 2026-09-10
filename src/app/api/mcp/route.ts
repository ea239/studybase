import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";
import { verifyMcpRequest } from "@/lib/mcp/auth";

const mcpHandler = createMcpHandler(
  async (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "studybase", version: "0.1.0" } }
);

// A bare shared secret, not OAuth — see src/lib/mcp/auth.ts. Enough to stop
// randoms from finding this endpoint if the app is ever deployed publicly;
// not real multi-user auth.
async function authed(req: Request): Promise<Response> {
  const ok = await verifyMcpRequest(req);
  if (!ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    });
  }
  return mcpHandler(req);
}

export { authed as GET, authed as POST, authed as DELETE };
