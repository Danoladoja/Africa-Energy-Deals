/**
 * Shared RSS XML fixture and mock-fetch helpers for DFI adapter tests.
 */

export function makeRssXml(items: { title: string; link: string; pubDate?: string; description?: string }[]): string {
  const itemsXml = items
    .map(
      (i) => `
    <item>
      <title><![CDATA[${i.title}]]></title>
      <link>${i.link}</link>
      <guid>${i.link}</guid>
      <pubDate>${i.pubDate ?? "Mon, 11 Apr 2025 10:00:00 GMT"}</pubDate>
      <description><![CDATA[${i.description ?? ""}]]></description>
    </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Google News — Africa Energy</title>
    <link>https://news.google.com</link>
    <description>News feed</description>
    ${itemsXml}
  </channel>
</rss>`;
}

export function makeFetchMock(xml: string): typeof globalThis.fetch {
  return () =>
    Promise.resolve(
      new Response(xml, {
        status: 200,
        headers: { "Content-Type": "application/rss+xml" },
      }),
    ) as ReturnType<typeof globalThis.fetch>;
}

export function makeFailingFetchMock(): typeof globalThis.fetch {
  return () => Promise.reject(new Error("Network error: connection refused")) as ReturnType<typeof globalThis.fetch>;
}

export const SAMPLE_ITEMS = [
  {
    title: "DFI invests $80mn in Nigeria 120 MW solar project",
    link: "https://example.com/dfi-nigeria-solar-2025",
    pubDate: "Mon, 11 Apr 2025 08:00:00 GMT",
    description: "A major DFI has committed USD 80 million to a 120 MW solar project in Kano, Nigeria.",
  },
  {
    title: "DFI backs Senegal 60 MW wind farm with $45mn loan",
    link: "https://example.com/dfi-senegal-wind-2025",
    pubDate: "Tue, 12 Apr 2025 09:30:00 GMT",
    description: "A second DFI investment targets the Senegal wind energy sector.",
  },
];
