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
//
// Deliberately 403, with no WWW-Authenticate header: a 401 + WWW-Authenticate
// is the RFC 9728 signal that tells an MCP-spec-aware client "this resource
// is OAuth-protected, go fetch /.well-known/oauth-protected-resource" — and
// ChatGPT does exactly that, then fails with "does not implement OAuth"
// since we don't have that endpoint. 403 just says "no", without implying
// there's an auth flow to discover.
async function authed(req: Request): Promise<Response> {
  const ok = await verifyMcpRequest(req);
  if (!ok) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return mcpHandler(req);
}

export { authed as GET, authed as POST, authed as DELETE };
