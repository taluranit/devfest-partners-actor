## What does DevFest.cz Sponsor Prospector do?

DevFest.cz Sponsor Prospector finds **companies likely to sponsor DevFest.cz**, the Prague developer conference organized by GUG.cz / the local Google Developer Group. It's built from a direct analysis of the [DevFest.cz](https://devfest.cz), [2025.devfest.cz](https://2025.devfest.cz), and [2019.devfest.cz](https://2019.devfest.cz) partner pages: sponsorship there is driven almost entirely by **developer-recruitment and employer-branding**, not general product marketing.

The Actor runs targeted Google searches (via [Google Search Results Scraper](https://apify.com/apify/google-search-scraper)) across four sponsor archetypes seen in past editions, de-duplicates the companies it finds by domain, and scores each one against the keyword signals that matched real past sponsors - so you get a ranked list of new prospects with a plain-English reason for each match. Optionally, it can also look up a likely outreach contact on LinkedIn (via [LinkedIn Company Employees Scraper](https://apify.com/harvestapi/linkedin-company-employees)) for each top-ranked company.

Run it directly in the Apify Console, via the API, or on a schedule to keep refreshing your sponsorship pipeline.

## Why use DevFest.cz Sponsor Prospector?

- **Skip generic sponsor lists.** Instead of searching "companies that sponsor tech conferences," this Actor targets the exact patterns DevFest.cz sponsors actually fit - dev shops hiring engineers, developer-tool SaaS, recruitment platforms, and enterprises with active tech-hiring arms.
- **Avoid re-pitching existing sponsors.** By default it filters out companies that already sponsored the 2019, 2025, or 2026 editions.
- **Get a reason, not just a name.** Every result includes which keyword signals matched and which past sponsor it resembles (e.g. "fits the same pattern as Applifting, Aricoma...").
- **Reuse it for similar conferences.** Swap the region and categories to prospect for any developer-focused, employer-branding-driven event.
- **Go straight to a contact, not just a company.** Optionally attaches a likely outreach contact (name, title, LinkedIn profile) in Marketing, Employer Branding, HR, DevRel, or Community for each top-ranked company.

## How to use DevFest.cz Sponsor Prospector

1. Click **Try for free** or **Start** in the Apify Console.
2. (Optional) Adjust the **regions** (default: `Czech Republic`) and **categories** to prospect for.
3. (Optional) Add your own **custom search queries** for niches the built-in categories don't cover.
4. Click **Start** and wait for the run to finish - it depends on how many queries are generated (regions × categories × templates).
5. Open the **Dataset** tab to view, sort, and export your ranked list of candidate sponsors.

## Input

| Field | Description | Default |
| --- | --- | --- |
| `regions` | Geographic phrases combined into each search query | `["Czech Republic"]` |
| `categories` | Which sponsor archetypes to search for: `devShops`, `saasTools`, `recruitment`, `enterprise` | all four |
| `customQueries` | Extra free-form Google queries to run alongside the category templates | `[]` |
| `excludeKnownSponsors` | Filter out companies that already sponsored DevFest.cz 2019/2025/2026, based on a hardcoded snapshot | `true` |
| `excludeCurrentPartners` | Fetch [devfest.cz/partners](https://devfest.cz/partners) live and filter out every partner listed there right now | `true` |
| `excludeDomains` | Additional domains to exclude | `[]` |
| `maxPagesPerQuery` | Google result pages to fetch per query (~10 results/page) | `1` |
| `maxResults` | Cap on the final ranked output list | `50` |
| `findContacts` | Look up a likely LinkedIn contact for the top-ranked companies (see [Personal data & compliance](#personal-data--compliance)) | `false` |
| `contactJobTitles` | Job titles/keywords used to filter LinkedIn employees when `findContacts` is on | Marketing, Employer Branding, HR, DevRel, Community titles |
| `maxCompaniesForContactSearch` | How many top-ranked companies to run the LinkedIn contact search for | `10` (max `20`) |

See the **Input** tab for the full schema with descriptions.

## Output

Each dataset item is one candidate company:

```json
{
    "companyName": "Applifting",
    "domain": "applifting.io",
    "website": "https://applifting.io",
    "primaryCategory": "Software dev shop / IT services (employer branding)",
    "score": 5,
    "matchedSignals": ["software development", "custom software", "we are hiring"],
    "whyItMightSponsor": "Fits the \"Software dev shop / IT services (employer branding)\" pattern seen in past DevFest.cz sponsors (e.g. Applifting, Aricoma, Second Foundation, Unicorn, FlowUp, Seyfor). Matched signals: software development, custom software, we are hiring.",
    "sampleSnippet": "Applifting builds custom software and helps companies scale their engineering teams...",
    "sourceQueries": ["software development company Czech Republic careers \"hiring developers\""],
    "foundUrls": ["https://applifting.io/en"],
    "contact": {
        "name": "Jane Doe",
        "title": "Marketing Manager at Applifting",
        "linkedinUrl": "https://www.linkedin.com/in/jane-doe-example"
    }
}
```

`contact` is only populated when `findContacts` is enabled and a match was found for that company; otherwise it's `null`.

You can download the dataset in various formats such as JSON, CSV, Excel, or HTML.

### Data table

| Field | Description |
| --- | --- |
| `companyName` | Best-effort company name extracted from the search result title |
| `domain` | Root domain, used for de-duplication |
| `website` | Homepage URL |
| `primaryCategory` | Sponsor archetype the company scored highest against |
| `score` | Relative ranking score (keyword matches + repeat appearances across queries) |
| `matchedSignals` | Keywords from the winning category that matched the page's title/description |
| `whyItMightSponsor` | Plain-English reasoning, naming comparable past DevFest.cz sponsors |
| `sampleSnippet` | A representative search-result description |
| `sourceQueries` | Which search queries surfaced this company |
| `foundUrls` | All distinct URLs found for this domain |
| `contact` | `{ name, title, linkedinUrl }` for a likely outreach contact, or `null` if `findContacts` is off or no match was found |

## Cost estimation

This Actor doesn't scrape pages itself - it orchestrates other Actors, which charge per unit of work:

- [Google Search Results Scraper](https://apify.com/apify/google-search-scraper) charges per search-results page scraped. With the default settings (4 categories × 1 region × ~2 templates = ~8 queries × 1 page), a run scrapes about 8 pages. Check its [pricing tab](https://apify.com/apify/google-search-scraper/pricing) for the current per-page rate, and multiply by however many queries your `regions` / `categories` / `customQueries` combination produces.
- If `findContacts` is enabled, [LinkedIn Company Employees Scraper](https://apify.com/harvestapi/linkedin-company-employees) additionally charges per LinkedIn profile scraped (around $4 per 1,000 profiles in its cheapest mode, which this Actor uses). With the default `maxCompaniesForContactSearch` of 10, a run scrapes up to ~50 profiles in a single batched search - a few cents. Check its [pricing tab](https://apify.com/harvestapi/linkedin-company-employees/pricing) for the current rate.

## Tips

- Start with the defaults on a single region to gauge quality before scaling up `regions` or `maxPagesPerQuery` - each addition multiplies the number of queries (and cost).
- Set `excludeKnownSponsors` to `false` if you want to see how existing sponsors would score, e.g. to validate the model against known-good matches.
- `excludeCurrentPartners` (live fetch) and `excludeKnownSponsors` (hardcoded snapshot) overlap for the current edition but aren't redundant: the live fetch stays accurate as the current partner roster changes, while the snapshot also covers past editions (2019/2025) that no longer appear on the live partners page.
- Use `customQueries` to prospect adjacent categories not covered by the four built-in archetypes (e.g. a specific industry vertical).
- LinkedIn's own job-title taxonomy varies a lot by company, so `contact` matching is best-effort - not every company will get a hit, and a hit isn't guaranteed to be the ideal person. Treat it as a starting point for outreach, not a verified decision-maker.

## Personal data & compliance

`findContacts` retrieves personal data (a person's name, job title, and LinkedIn profile URL) via a third-party Actor that scrapes LinkedIn. Before enabling it:

- Only use it for a legitimate business purpose (e.g. sponsorship outreach), and handle the data you collect in line with GDPR or your local equivalent.
- Review [LinkedIn Company Employees Scraper](https://apify.com/harvestapi/linkedin-company-employees)'s own documentation and terms, since it - not this Actor - performs the actual LinkedIn scraping.
- Scraping LinkedIn may be subject to LinkedIn's Terms of Service; use at your own discretion.

`findContacts` defaults to `false` so this is always an explicit, opt-in choice.

## FAQ

**Is this scraping Google directly?** No - it calls the [Google Search Results Scraper](https://apify.com/apify/google-search-scraper) Actor, which handles that.

**Is this scraping LinkedIn directly?** No - when `findContacts` is enabled, it calls [LinkedIn Company Employees Scraper](https://apify.com/harvestapi/linkedin-company-employees), which handles that. See [Personal data & compliance](#personal-data--compliance).

**How accurate is the categorization?** Scoring is keyword-based (no LLM call), so treat `primaryCategory` and `score` as a first-pass ranking to prioritize manual review, not a definitive verdict.

**Can I use this for a different conference?** Yes - edit the categories, keywords, and past-sponsor exclusion list in `src/sponsorProfiles.js` to match your event's actual sponsor history.

Found a bug or have a feature request? Open an issue on the Actor's Issues tab.
