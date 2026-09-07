import { Actor, log } from 'apify';

const LINKEDIN_ACTOR_ID = 'harvestapi/linkedin-company-employees';

// Strip common legal suffixes and punctuation so "Applifting s.r.o." and "Applifting" line up.
function normalizeCompanyName(name) {
    return name
        .toLowerCase()
        .replace(/\b(s\.?r\.?o\.?|a\.?s\.?|z\.?s\.?|gmbh|inc\.?|ltd\.?|llc\.?|co\.?)\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * For the top-ranked candidates, searches LinkedIn for a likely sponsorship contact (Marketing,
 * Employer Branding, HR, DevRel, or Community) via harvestapi/linkedin-company-employees, and
 * mutates each candidate in place with a `contact` field ({ name, title, linkedinUrl } or null).
 * Best-effort: LinkedIn search matching is fuzzy, and not every company will have a hit.
 */
export async function enrichWithContacts(candidates, { jobTitles, maxCompanies }) {
    const targets = candidates.slice(0, maxCompanies);
    for (const candidate of candidates) candidate.contact = null;
    if (targets.length === 0) return;

    log.info(`Searching LinkedIn for a contact at ${targets.length} compan${targets.length === 1 ? 'y' : 'ies'} via ${LINKEDIN_ACTOR_ID}...`);

    let run;
    try {
        run = await Actor.call(LINKEDIN_ACTOR_ID, {
            companies: targets.map((c) => c.companyName),
            jobTitles,
            profileScraperMode: 'Short ($4 per 1k)',
            companyBatchMode: 'all_at_once',
            maxItems: Math.min(targets.length * 5, 100),
        });
    } catch (error) {
        log.warning(`LinkedIn contact search failed (${error.message}); leaving contacts empty.`);
        return;
    }

    const { items: profiles } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
    log.info(`Found ${profiles.length} LinkedIn profile(s) across the searched companies.`);

    for (const profile of profiles) {
        const profileCompanyName = profile.currentPosition?.[0]?.companyName ?? profile.experience?.[0]?.companyName;
        if (!profileCompanyName) continue;
        const normalizedProfileCompany = normalizeCompanyName(profileCompanyName);

        const match = targets.find((candidate) => {
            if (candidate.contact) return false; // keep the first (best-ranked-by-actor) hit per company
            const normalizedCandidate = normalizeCompanyName(candidate.companyName);
            // Require a few real characters on both sides before trusting a substring match,
            // so short/generic normalized names (e.g. "io") don't match unrelated companies.
            if (normalizedCandidate.length < 3 || normalizedProfileCompany.length < 3) return false;
            return normalizedProfileCompany.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedProfileCompany);
        });
        if (!match) continue;

        match.contact = {
            name: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || null,
            title: profile.headline ?? null,
            linkedinUrl: profile.linkedinUrl ?? null,
        };
    }
}
