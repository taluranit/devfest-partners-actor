import { log } from 'apify';
import * as cheerio from 'cheerio';

const DEVFEST_PARTNERS_URL = 'https://devfest.cz/partners';

// Extra safety net beyond "not our own hostname" - social/map platforms should never be
// treated as a partner's own domain even if a future page redesign wraps their icon in a link.
const NON_PARTNER_DOMAINS = new Set([
    'maps.app.goo.gl',
    'google.com',
    'facebook.com',
    'x.com',
    'twitter.com',
    'instagram.com',
    'linkedin.com',
    'youtube.com',
    'bsky.app',
    'github.com',
]);

/**
 * Fetches the live DevFest.cz partners page and extracts the domains of current partners.
 * Partner logos are rendered as `<a href="https://partner-site"><img ... /></a>`, so any
 * external link wrapping an image - other than the site's own logo - is a partner.
 * Returns an empty array (and logs a warning) if the page can't be fetched or parsed, so a
 * transient network issue degrades gracefully instead of failing the whole run.
 */
export async function fetchCurrentPartnerDomains(url = DEVFEST_PARTNERS_URL) {
    let html;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            log.warning(`Could not fetch current partners page (HTTP ${response.status}); skipping current-partner exclusion.`);
            return [];
        }
        html = await response.text();
    } catch (error) {
        log.warning(`Could not fetch current partners page: ${error.message}; skipping current-partner exclusion.`);
        return [];
    }

    const $ = cheerio.load(html);
    const ownHost = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const domains = new Set();

    $('a:has(img)').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        let absoluteUrl;
        try {
            absoluteUrl = new URL(href, url);
        } catch {
            return;
        }
        if (!absoluteUrl.protocol.startsWith('http')) return;

        const hostname = absoluteUrl.hostname.replace(/^www\./, '').toLowerCase();
        if (hostname === ownHost || NON_PARTNER_DOMAINS.has(hostname)) return;

        domains.add(hostname);
    });

    return [...domains];
}
