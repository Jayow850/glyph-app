/** @type {import('next').NextConfig} */
export default {
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // Static generation defaults to one render worker per CPU core, and
    // several Node heaps at once is what exhausts this machine — exit
    // code 0xC0000409 is a worker aborting, not a fault in the app.
    // One worker, in process, is slower and finishes.
    workerThreads: false,
    cpus: 1,
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};
