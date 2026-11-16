import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const config: NextConfig = {
  transpilePackages: ["@erp/contracts", "@erp/domain", "@erp/i18n"],
  poweredByHeader: false,
};

export default withNextIntl(config);
