// Sponsor archetypes derived from analyzing DevFest.cz (Prague, run by GUG.cz / GDG) partner
// lists across the 2019, 2025, and 2026 editions. Sponsorship there is consistently driven by
// developer-recruitment / employer-branding, not general product marketing.
export const CATEGORIES = {
    devShops: {
        label: 'Software dev shop / IT services (employer branding)',
        exampleSponsors: ['Applifting', 'Aricoma', 'Second Foundation', 'Unicorn', 'FlowUp', 'Seyfor'],
        queryTemplates: [
            'software development company {region} careers "hiring developers"',
            '"custom software development" agency {region} jobs',
        ],
        keywords: [
            'software development',
            'it services',
            'custom software',
            'outsourcing',
            'software house',
            'nearshore',
            'digital agency',
            'system integrator',
            'it consulting',
            'we are hiring',
            'developer jobs',
        ],
    },
    saasTools: {
        label: 'SaaS / developer-tool platform',
        exampleSponsors: ['Wrike', 'Make', 'Mews', 'signageOS', 'Apify'],
        queryTemplates: [
            'SaaS startup {region} "developer platform"',
            'cloud software company {region} API developers',
        ],
        keywords: [
            'saas',
            'platform',
            ' api ',
            'cloud platform',
            'developer tools',
            'no-code',
            'automation platform',
            'workflow automation',
            'developer experience',
            'b2b software',
        ],
    },
    recruitment: {
        label: 'Recruitment / job platform targeting developers',
        exampleSponsors: ['Alma Career', 'ProRocketeers', 'StartupJobs.cz'],
        queryTemplates: [
            'IT recruitment agency {region}',
            'tech job board OR staffing agency {region} software engineers',
        ],
        keywords: [
            'recruitment',
            'staffing',
            'job board',
            'talent acquisition',
            'hiring platform',
            'recruitment agency',
            'career platform',
            'job portal',
            'employer branding',
        ],
    },
    enterprise: {
        label: 'Large enterprise with an active tech-hiring arm',
        exampleSponsors: ['Česká spořitelna', 'MSD'],
        queryTemplates: [
            'bank OR insurance OR pharma company {region} "engineering team" hiring developers',
            'enterprise company {region} "tech hub" developer center',
        ],
        keywords: [
            'engineering team',
            'tech hub',
            'digital transformation',
            'it department',
            'developer center',
            'innovation lab',
            'technology center',
        ],
    },
};

// Domains of companies that have already sponsored DevFest.cz (2019 / 2025 / 2026 editions),
// plus the organizer and its structural Google/GDG affiliation. Used to filter out non-prospects.
export const PAST_SPONSOR_DOMAINS = [
    // Organizer / structural sponsor - not a prospect
    'gug.cz',
    'devfest.cz',
    'google.com',
    'cloud.google.com',
    'gdg.community.dev',
    // 2026 edition
    'csas.cz',
    'make.com',
    'seyfor.com',
    'wrike.com',
    'apify.com',
    'almacareer.com',
    'aricoma.com',
    'second-foundation.eu',
    'applifting.io',
    // 2025 edition
    'mews.com',
    'prusa3d.com',
    'kiwi.com',
    'signageos.io',
    'prorocketeers.com',
    'livesport.eu',
    'msd.cz',
    'ui.com',
    'fathers.cz',
    'pivovarbubenec.cz',
    'kavovyklub.cz',
    'tlamagames.com',
    // 2019 edition
    'unicorn.com',
    'flowup.cz',
    'applifting.cz',
];

// Generic directories, social networks, and aggregators that show up in search results but are
// never the prospect's own company website.
export const NON_COMPANY_DOMAINS = [
    'wikipedia.org',
    'linkedin.com',
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'youtube.com',
    'crunchbase.com',
    'glassdoor.com',
    'indeed.com',
    'reddit.com',
    'medium.com',
    'g2.com',
    'capterra.com',
    'clutch.co',
    'goodfirms.co',
    'quora.com',
    'pinterest.com',
    'github.com',
];
