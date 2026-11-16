import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@erp/contracts", "@erp/domain"],
  poweredByHeader: false,
};

export default config;
