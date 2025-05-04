import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['assets.aceternity.com', "www.auraui.com", "ibb.co", "https://postimg.cc", "metadatafinz.s3.ap-south-1.amazonaws.com","pbs.twimg.com"],
  },

};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
