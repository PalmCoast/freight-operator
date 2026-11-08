import { pollOnce } from "@freight/operator";

const workerId = `worker-${process.pid}`;
let stopped = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop(): Promise<void> {
  console.log(`freight worker ${workerId} polling for runnable operator jobs`);
  while (!stopped) {
    try {
      const worked = await pollOnce(workerId);
      if (!worked) await sleep(1000);
    } catch (error) {
      console.error("worker tick failed", error);
      await sleep(2000);
    }
  }
  console.log(`freight worker ${workerId} stopped`);
}

process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});

void loop();
