import { Actor, log } from 'apify';

import { enrichWithContacts } from './contactFinder.js';
import { fetchCurrentPartnerDomains } from './currentPartners.js';
import { CATEGORIES, NON_COMPANY_DOMAINS, PAST_SPONSOR_DOMAINS } from './sponsorProfiles.js';

const SEARCH_ACTOR_ID = 'apify/google-search-scraper';

const DEFAULT_CONTACT_JOB_TITLES = [
    'Marketing Manager',
    'Head of Marketing',
    'Employer Branding',
    'Employer Branding Manager',
    'HR Manager',
    'Human Resources',
    'People Operations',
    'Talent Acquisition',
    'Developer Relations',
    'Developer Advocate',
    'DevRel',
    'Community Manager',
    'Head of Community',
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

function cleanCompanyName(titles, domain) {
    const firstTitle = titles.find((t) => t && t.trim().length > 0);
    if (!firstTitle) return domain;
    // Strip common "Title | Site name" / "Title - Site name" suffixes, keep the first segment.
    return firstTitle.split(/[|\-–]/)[0].trim() || domain;
}

const rankedCandidates = [...candidatesByDomain.values()]
    .map((candidate) => {
        const { bestCategory, matchedSignals, totalScore } = scoreCandidate(candidate);
        return {
            companyName: cleanCompanyName(candidate.titles, candidate.domain),
            domain: candidate.domain,
            website: candidate.website,
            primaryCategory: bestCategory ? CATEGORIES[bestCategory].label : 'Uncategorized (custom query)',
            score: totalScore,
            matchedSignals,
            whyItMightSponsor: buildWhySponsor(bestCategory, matchedSignals),
            sampleSnippet: candidate.snippets[0] ?? '',
            sourceQueries: [...candidate.sourceQueries],
            foundUrls: [...candidate.urls],
        };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

if (findContacts) {
    await enrichWithContacts(rankedCandidates, { jobTitles: contactJobTitles, maxCompanies: maxCompaniesForContactSearch });
}

log.info(`Pushing ${rankedCandidates.length} ranked candidate(s) to the dataset.`);
await Actor.pushData(rankedCandidates);

await Actor.exit();
