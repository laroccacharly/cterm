Bun.serve({
  hostname: "127.0.0.1",
  port: 3212,
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === "/health") {
      return new Response("ok")
    }
    if (pathname === "/v1/prepare" && request.method === "POST") {
      return Response.json({})
    }
    if (pathname !== "/v1/transcribe" || request.method !== "POST") {
      return new Response("not found", { status: 404 })
    }
    const audio = await request.arrayBuffer()
    if (
      !(request.headers.get("content-type") ?? "").startsWith("audio/") ||
      audio.byteLength === 0
    ) {
      return Response.json({ message: "Invalid recording" }, { status: 400 })
    }
    return Response.json({ text: "cterm-stt-test" })
  },
})
