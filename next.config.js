/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" }, // drawings/document uploads, including zipped folders
  },
};

module.exports = nextConfig;
