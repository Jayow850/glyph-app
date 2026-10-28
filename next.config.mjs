/** @type {import('next').NextConfig} */

/**
 * Static generation defaults to one render worker per CPU core, and
 * several Node heaps at once is more than the Windows dev machine has —
 * the build dies with exit code 0xC0000409, a worker aborting, which
 * looks like an app fault and is not one. One in-process worker is
 * slower and finishes.
 *
 * Vercel's builders have the memory, so they keep the full pool. Pinning
 * this everywhere would make every deploy needlessly slow.
 */
const constrained = process.platform === "win32";

export default {
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    ...(constrained ? { workerThreads: false, cpus: 1 } : {}),
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};
