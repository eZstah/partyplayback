// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://youple.tv",
	output: "server",
	integrations: [mdx(), sitemap({ filter: page => new URL(page).pathname === "/" })],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
