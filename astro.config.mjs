// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://youple.tv",
	output: "server",
	integrations: [sitemap({ filter: page => new URL(page).pathname === "/" })],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
