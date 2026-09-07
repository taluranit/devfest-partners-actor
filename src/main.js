import { Actor, log } from 'apify';

import { enrichWithContacts } from './contactFinder.js';
import { fetchCurrentPartnerDomains } from './currentPartners.js';
import { CATEGORIES, NON_COMPANY_DOMAINS, PAST_SPONSOR_DOMAINS } from './sponsorProfiles.js';

const SEARCH_ACTOR_ID = 'apify/google-search-scraper';

// Broad, short terms - confirmed by a live test call to match real titles like "Talent Acquisition
// Partner", "Employer branding & marketing specialist", and "Senior People Care Partner". Longer,
// more specific phrases (e.g. "Employer Branding Manager") matched far fewer real-world titles.
const DEFAULT_CONTACT_JOB_TITLES = [
    'Marketing',
    'Employer Branding',
    'HR',
    'Human Resources',
    'People',
    'Talent Acquisition',
    'Recruiting',
    'Developer Relations',
    'DevRel',
    'Developer Advocate',
    'Community',
];

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    regions = ['Czech Republic'],
    categories = Object.keys(CATEGORIES),
    customQueries = [],
    excludeKnownSponsors = true,
    excludeCurrentPartners = true,
    excludeDomains = [],
    maxPagesPerQuery = 1,
    maxResults = 50,
    findContacts = false,
    contactJobTitles = DEFAULT_CONTACT_JOB_TITLES,
    maxCompaniesForContactSearch = 10,
} = input;

const selectedCategories = categories.filter((key) => CATEGORIES[key]);
if (selectedCategories.length === 0 && customQueries.length === 0) {
    throw new Error('Select at least one category, or provide customQueries.');
}

const excludedDomainSet = new Set(
    [...NON_COMPANY_DOMAINS, ...(excludeKnownSponsors ? PAST_SPONSOR_DOMAINS : []), ...excludeDomains].map((d) =>
        d.toLowerCase().replace(/^www\./, ''),
    ),
);

if (excludeCurrentPartners) {
    const currentPartnerDomains = await fetchCurrentPartnerDomains();
    log.info(`Excluding ${currentPartnerDomains.length} domain(s) found on the live DevFest.cz partners page.`);
    for (const domain of currentPartnerDomains) {
        excludedDomainSet.add(domain);
    }
}

// Build {query, category} pairs: one query per (category template x region), plus custom queries
// (category: null - scored purely by keyword overlap across all categories).
const queryPlan = [];
for (const categoryKey of selectedCategories) {
    const { queryTemplates } = CATEGORIES[categoryKey];
    for (const region of regions) {
        for (const template of queryTemplates) {
            queryPlan.push({ query: template.replace('{region}', region).trim(), category: categoryKey });
        }
    }
}
for (const query of customQueries) {
    queryPlan.push({ query: query.trim(), category: null });
}

log.info(`Built ${queryPlan.length} search queries across ${selectedCategories.length} categories and ${regions.length} region(s).`);

const queryToCategory = new Map(queryPlan.map(({ query, category }) => [query, category]));

log.info(`Calling ${SEARCH_ACTOR_ID} to fetch Google search results...`);
const run = await Actor.call(SEARCH_ACTOR_ID, {
    queries: queryPlan.map(({ query }) => query).join('\n'),
    maxPagesPerQuery,
});

const { items: searchPages } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
log.info(`Received ${searchPages.length} search result page(s) from ${SEARCH_ACTOR_ID}.`);

// Aggregate organic results by domain across every query/page they showed up in.
const candidatesByDomain = new Map();

for (const page of searchPages) {
    const queryTerm = page.searchQuery?.term?.trim();
    const originCategory = queryToCategory.get(queryTerm) ?? null;

    for (const result of page.organicResults ?? []) {
        let domain;
        try {
            domain = new URL(result.url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            continue;
        }
        if (excludedDomainSet.has(domain)) continue;

        if (!candidatesByDomain.has(domain)) {
            candidatesByDomain.set(domain, {
                domain,
                website: `https://${domain}`,
                titles: [],
                snippets: [],
                urls: new Set(),
                sourceQueries: new Set(),
                originCategories: new Set(),
            });
        }
        const candidate = candidatesByDomain.get(domain);
        candidate.titles.push(result.title ?? '');
        if (result.description) candidate.snippets.push(result.description);
        candidate.urls.add(result.url);
        if (queryTerm) candidate.sourceQueries.add(queryTerm);
        if (originCategory) candidate.originCategories.add(originCategory);
    }
}

log.info(`Found ${candidatesByDomain.size} unique candidate domain(s) after de-duplication and filtering.`);

// Score each candidate against every category's keyword list, regardless of which query
// surfaced it - a devShops-query result can still score highly on saasTools keywords.
function scoreCandidate(candidate) {
    const text = `${candidate.titles.join(' ')} ${candidate.snippets.join(' ')}`.toLowerCase();

    // 0 = "no clear category match" rather than defaulting to whichever category is checked first.
    let bestCategory = null;
    let bestKeywordScore = 0;
    const matchedSignalsByCategory = {};

    for (const [categoryKey, profile] of Object.entries(CATEGORIES)) {
        const matched = profile.keywords.filter((keyword) => text.includes(keyword));
        matchedSignalsByCategory[categoryKey] = matched;
        // Originating from that category's search query is a strong signal on its own.
        const originBonus = candidate.originCategories.has(categoryKey) ? 2 : 0;
        const keywordScore = matched.length + originBonus;
        if (keywordScore > bestKeywordScore) {
            bestKeywordScore = keywordScore;
            bestCategory = categoryKey;
        }
    }

    const occurrenceBonus = candidate.sourceQueries.size - 1; // seen across multiple queries
    const totalScore = bestKeywordScore + Math.max(occurrenceBonus, 0);

    return { bestCategory, bestKeywordScore, matchedSignals: matchedSignalsByCategory[bestCategory] ?? [], totalScore };
}

function buildWhySponsor(bestCategory, matchedSignals) {
    if (!bestCategory) {
        return 'Surfaced by a custom search query; review manually to judge sponsor fit.';
    }
    const profile = CATEGORIES[bestCategory];
    const signalsText = matchedSignals.length > 0 ? ` Matched signals: ${matchedSignals.join(', ')}.` : '';
    return `Fits the "${profile.label}" pattern seen in past DevFest.cz sponsors (e.g. ${profile.exampleSponsors.join(', ')}).${signalsText}`;
}

// Generic nav/breadcrumb words that are never a company's own name, even when they end up as
// the first title segment (e.g. "Product | Acme Inc" would otherwise extract as "Product").
const GENERIC_TITLE_SEGMENTS = new Set(['home', 'homepage', 'product', 'products', 'blog', 'about', 'about us', 'contact', 'news', 'login', 'search', 'careers', 'jobs']);

function cleanCompanyName(titles, domain) {
    const firstTitle = titles.find((t) => t && t.trim().length > 0);
    if (!firstTitle) return domain;
    // Strip common "Title | Site name" / "Title - Site name" / "Title: Site name" wrapping, then
    // prefer the longest non-generic segment - real company names are rarely the single shortest
    // word in the title, but pages inconsistently put the site name first or last.
    const segments = firstTitle
        .split(/[|:\-–]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && !GENERIC_TITLE_SEGMENTS.has(s.toLowerCase()));
    if (segments.length === 0) return firstTitle.trim() || domain;
    return segments.reduce((longest, s) => (s.length > longest.length ? s : longest), segments[0]);
}

// Common resume/bio-bullet opening verbs - a real company name is essentially never the first
// word of a past-tense achievement statement (e.g. a LinkedIn summary fragment leaking through
// as a search result "title").
const BIO_FRAGMENT_STARTERS = new Set([
    'led', 'built', 'helped', 'created', 'founded', 'launched', 'drove', 'managed', 'delivered', 'grew', 'scaled', 'developed', 'designed',
]);

// Search results sometimes surface listicles, job-board aggregators, individual job postings, or
// bio/resume fragments instead of an actual company - these should never be a candidate sponsor.
function looksLikeListicleOrAggregator(companyName) {
    const text = companyName.toLowerCase();
    const commaCount = (companyName.match(/,/g) ?? []).length;
    const firstWord = text.split(/\s+/)[0]?.replace(/[^a-z]/g, '');
    return (
        /^\d+\s/.test(text) ||
        /\b(top|best)\b/.test(text) ||
        /\bjobs?\s+in\b/i.test(text) ||
        // Job-board titles like "Software Engineer in Prague, Praha, Czech Republic" (plural-safe, case-insensitive)
        /\b(engineers?|developers?|managers?|specialists?|analysts?|designers?|consultants?)\s+in\s+[a-z]/i.test(companyName) ||
        /\((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\)/i.test(companyName) ||
        /\b(startups|investors|agencies|freelancers|scrapers)\b/.test(text) ||
        /^how\b/.test(text) || // blog-post headlines: "How X Helps ..."
        /\bfor\s+\w+\s+(projects?|teams?|startups?|businesses?|companies)\b/.test(text) ||
        commaCount >= 2 || // real company names essentially never carry a location breadcrumb tail
        BIO_FRAGMENT_STARTERS.has(firstWord)
    );
}

// Maps a region string to extra text/domain signals that confirm a candidate is actually tied to
// that region - not just that the region name appeared in the search *query* that found it.
const REGION_ALIASES = {
    'czech republic': ['czech', 'czechia', 'prague', 'praha', 'brno', 'ostrava', 'plzeň', 'plzen', '.cz'],
    czechia: ['czech', 'czechia', 'prague', 'praha', 'brno', 'ostrava', 'plzeň', 'plzen', '.cz'],
    prague: ['prague', 'praha', '.cz'],
    slovakia: ['slovak', 'bratislava', '.sk'],
    poland: ['poland', 'polska', 'warsaw', 'warszawa', 'krakow', 'kraków', '.pl'],
    hungary: ['hungary', 'budapest', '.hu'],
    'central and eastern europe': ['czech', 'slovak', 'poland', 'hungary', 'central europe', 'eastern europe', 'cee'],
    cee: ['czech', 'slovak', 'poland', 'hungary', 'central europe', 'eastern europe', 'cee'],
};

function getRegionAliases(region) {
    return REGION_ALIASES[region.toLowerCase().trim()] ?? [region.toLowerCase().trim()];
}

// True only if the region actually appears in the result's own text/domain - not merely in the
// query that found it - so a globally-known company that happens to rank for a Czech-flavored
// query (e.g. via an unrelated case study) doesn't get silently presented as a Czech prospect.
function hasRegionSignal(candidate, targetRegions) {
    const text = `${candidate.titles.join(' ')} ${candidate.snippets.join(' ')} ${candidate.domain}`.toLowerCase();
    return targetRegions.some((region) => getRegionAliases(region).some((alias) => text.includes(alias)));
}

const rankedCandidates = [...candidatesByDomain.values()]
    .map((candidate) => {
        const companyName = cleanCompanyName(candidate.titles, candidate.domain);
        if (looksLikeListicleOrAggregator(companyName)) return null;

        const { bestCategory, matchedSignals, totalScore } = scoreCandidate(candidate);
        const regionVerified = hasRegionSignal(candidate, regions);
        return {
            companyName,
            domain: candidate.domain,
            website: candidate.website,
            primaryCategory: bestCategory ? CATEGORIES[bestCategory].label : 'Uncategorized (custom query)',
            score: totalScore + (regionVerified ? 3 : 0),
            regionVerified,
            matchedSignals,
            whyItMightSponsor: buildWhySponsor(bestCategory, matchedSignals),
            sampleSnippet: candidate.snippets[0] ?? '',
            sourceQueries: [...candidate.sourceQueries],
            foundUrls: [...candidate.urls],
        };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

if (findContacts) {
    await enrichWithContacts(rankedCandidates, { jobTitles: contactJobTitles, maxCompanies: maxCompaniesForContactSearch });
}

log.info(`Pushing ${rankedCandidates.length} ranked candidate(s) to the dataset.`);
await Actor.pushData(rankedCandidates);

await Actor.exit();
