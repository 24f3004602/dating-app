// Runs once when a Next.js server starts. On the Node.js server, check the settings first (D147).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
