import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken, tokenPrefix, expiresAtFrom } from "@/lib/api-tokens";
async function main() {

const t0 = Date.now();
const log = (m: string) => console.log(`${Date.now() - t0}ms ${m}`);
const user = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
const token = generateToken();
const row = await prisma.apiToken.create({ data: { userId: user.id, name: "probe", tokenHash: hashToken(token), prefix: tokenPrefix(token), expiresAt: expiresAtFrom(new Date(), 7) } });
const client = new Client({ name: "probe", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3000/api/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
log("connected");
await client.callTool({ name: "whoami", arguments: {} });
log("called");
await client.close();
log("closed");
await prisma.apiToken.delete({ where: { id: row.id } });
if (process.argv[2] === "disconnect") await prisma.$disconnect();
log("done");
process.on("exit", () => log("exit"));

const t = setInterval(() => console.log(Date.now()-t0, "active:", process.getActiveResourcesInfo().filter(r => r !== "Timeout")), 5000); t.unref();
}
void main();
