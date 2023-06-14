import { colors, flags } from "./deps.ts";
import Server from "./src/server.ts";

const args = flags.parse(Deno.args, {
  string: ["port"],
});

export const port = parseInt(args.port ?? "") || 3000;

const server = new Server();

server.app.addEventListener("listen", ({ hostname, port, serverType }) => {
  console.log(
      colors.bold("Start listening on ") + colors.yellow(`${hostname}:${port}`),
  );
  console.log(colors.bold("  using HTTP server: " + colors.yellow(serverType)));
});

await server.app.listen({ port });