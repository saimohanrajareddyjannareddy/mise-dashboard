import type { MetadataRoute } from 'next'

/*
 * Crawl rules: the marketing/auth surfaces are public; the app
 * itself (dashboard, API) is per-restaurant private data and stays
 * out of search indexes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/'],
    },
    sitemap: 'https://www.getinvoiceiq.com/sitemap.xml',
  }
}
